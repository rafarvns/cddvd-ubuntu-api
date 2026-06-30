import fs from 'fs/promises';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import { ShellService } from '../../infra/shell/shell.service';
import { BurnJob } from '../../shared/types/burn.types';
import { config } from '../../config/env';

export class BurnService {
  /**
   * Extrai o progresso da saída dos gravadores e atualiza o job.
   * Reconhece:
   *  - "Track 01: 1846 of 4291 MB written ..." (cdrdao/wodim)
   *  - "  104071168/4700372992 ( 2.2%) @5.9x ..." (growisofs)
   * Usa a última ocorrência do chunk.
   */
  static updateProgress(job: BurnJob, chunk: string): void {
    let pct: number | null = null;

    // growisofs: percentual entre parênteses
    const pctRegex = /\(\s*([\d.]+)%\)/g;
    let pm: RegExpExecArray | null;
    let lastPct: RegExpExecArray | null = null;
    while ((pm = pctRegex.exec(chunk)) !== null) lastPct = pm;
    if (lastPct) {
      pct = parseFloat(lastPct[1]);
    } else {
      // cdrdao/wodim: "X of Y MB"
      const mbRegex = /(\d+)\s+of\s+(\d+)\s+MB/gi;
      let mm: RegExpExecArray | null;
      let lastMb: RegExpExecArray | null = null;
      while ((mm = mbRegex.exec(chunk)) !== null) lastMb = mm;
      if (lastMb) {
        const written = parseInt(lastMb[1], 10);
        const total = parseInt(lastMb[2], 10);
        if (total > 0) pct = (written / total) * 100;
      }
    }

    if (pct === null) return;

    const clamped = Math.min(99, Math.round(pct));
    if (clamped > job.progress) {
      job.progress = clamped;
    }
  }

  /**
   * Registra nos logs as informações da mídia inserida (Media ID/fabricante,
   * velocidades de gravação suportadas, capacidade) via dvd+rw-mediainfo.
   * Best-effort: nunca interrompe a gravação se falhar.
   */
  static async logMediaInfo(job: BurnJob): Promise<void> {
    try {
      const result = await ShellService.execute('dvd+rw-mediainfo', [config.driveDevice]);
      const text = (result.stdout || result.stderr || '').trim();
      if (!text) return;

      job.logs.push('--- Mídia (dvd+rw-mediainfo) ---');
      for (const line of text.split('\n')) {
        const t = line.trim();
        // Mantém só as linhas mais úteis para diagnóstico
        if (/Media (ID|Book Type|Type|Profile)|Manufacturer|Speed|Legacy lead-out|Disc status|Free Blocks/i.test(t)) {
          job.logs.push(t);
        }
      }
      job.logs.push('-------------------------------');
    } catch {
      // dvd+rw-mediainfo ausente ou sem disco legível — segue a gravação normalmente
    }
  }

  /**
   * Instrui o gravador a marcar a mídia DVD+R como DVD-ROM (bitsetting/booktype).
   * Isso aumenta a compatibilidade com leitores antigos/exigentes como o PS2,
   * que frequentemente têm dificuldade com DVD+R "cru". Deve ser chamado ANTES
   * da gravação (o firmware aplica a marcação ao escrever o lead-in).
   * Best-effort: depende do gravador suportar; nunca interrompe a gravação.
   * Só faz sentido para DVD+R/+RW (DVD-R tem o lead-in prensado de fábrica).
   */
  static async setBookType(job: BurnJob): Promise<void> {
    try {
      const result = await ShellService.execute('dvd+rw-booktype', [
        '-dvd-rom-spec',
        '-unit+r',
        config.driveDevice,
      ]);
      const text = (result.stdout || '') + (result.stderr || '');

      if (result.code === 0 || /brand DVD\+R media as DVD-ROM/i.test(text)) {
        job.logs.push('Booktype: gravador marcará DVD+R como DVD-ROM ✅ (melhor compatibilidade com PS2).');
      } else {
        job.logs.push('[warn] Gravador não aceitou o booktype DVD-ROM (segue gravando como DVD+R comum). Em DVD-R isso é esperado e inofensivo.');
      }
    } catch {
      job.logs.push('[warn] Não foi possível aplicar booktype DVD-ROM (gravador não suporta ou ferramenta ausente). Gravação segue normalmente.');
    }
  }

  /**
   * Calcula o hash MD5 de uma fonte (arquivo ou device de bloco), lendo no
   * máximo `maxBytes` bytes. Alinhado a 2048 (setor de DVD) para ler discos
   * ópticos sem estourar a área gravada.
   */
  private static streamHash(
    source: string,
    maxBytes: number,
    signal: AbortSignal,
    onProgress?: (bytesRead: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      let read = 0;
      const stream = createReadStream(source, {
        highWaterMark: 1024 * 1024, // 1 MiB (múltiplo de 2048)
        end: maxBytes - 1,          // offset inclusivo
      });

      stream.on('data', (chunk) => {
        if (signal.aborted) {
          stream.destroy(new Error('AbortError'));
          return;
        }
        hash.update(chunk);
        read += chunk.length;
        if (onProgress) onProgress(read);
      });
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Verifica a gravação: lê do disco exatamente o tamanho da imagem e compara
   * o hash com o do arquivo de origem. Lança erro se houver divergência
   * (gravação defeituosa). Se o disco não puder ser lido, apenas avisa.
   */
  static async verifyBurn(job: BurnJob): Promise<void> {
    const signal = job.abortController!.signal;
    const { size } = await fs.stat(job.file);

    job.logs.push(`Verificando gravação (${(size / 1024 / 1024).toFixed(0)} MB)...`);

    const srcHash = await BurnService.streamHash(job.file, size, signal);

    let discHash: string;
    try {
      let lastDecile = -1;
      discHash = await BurnService.streamHash(config.driveDevice, size, signal, (bytes) => {
        const decile = Math.floor((bytes / size) * 10);
        if (decile > lastDecile) {
          lastDecile = decile;
          job.logs.push(`Verificação: ${decile * 10}%`);
          job.updatedAt = new Date();
        }
      });
    } catch (err: any) {
      if (err?.message === 'AbortError') throw err;
      job.logs.push(`[warn] Não foi possível ler o disco para verificar: ${err?.message}. A gravação em si foi concluída.`);
      return;
    }

    if (srcHash !== discHash) {
      throw new Error('Verificação falhou: o disco não confere com a imagem (gravação defeituosa). Tente regravar em velocidade menor.');
    }

    job.logs.push('✅ Verificação OK: o disco confere exatamente com a imagem.');
  }

  /**
   * Ejeta a bandeja após a gravação. Tenta o binário `eject` e, se ele não
   * existir/ falhar (comum em imagens enxutas), recorre ao `wodim -eject`.
   */
  static async ejectTray(job: BurnJob): Promise<void> {
    const attempts: [string, string[]][] = [
      ['eject', [config.driveDevice]],
      ['wodim', [`dev=${config.driveDevice}`, '-eject']],
    ];

    for (const [command, args] of attempts) {
      try {
        const result = await ShellService.execute(command, args);
        if (result.code === 0 || result.code === null) {
          job.logs.push(`Bandeja ejetada (${command}).`);
          return;
        }
      } catch {
        // tenta o próximo método
      }
    }

    job.logs.push('[warn] Não foi possível ejetar a bandeja (gravação concluída mesmo assim).');
  }

  /**
   * Processador de gravação. Prepara os comandos e invoca o ShellService.
   */
  static async processJob(job: BurnJob): Promise<void> {
    try {
      await fs.access(job.file);
    } catch {
      throw new Error(`Arquivo não encontrado no disco: ${job.file}`);
    }

    job.abortController = new AbortController();
    
    // Mock Mode fallback
    if (config.isWindows) {
      job.logs.push('Ambiente Windows detectado. Simulando gravação de 10 segundos...');
      job.logs.push(`Opções: speed=${job.options.speed ?? 'auto'}, dummy=${job.options.dummy}, eject=${job.options.eject}, burnfree=${job.options.burnfree}, verify=${job.options.verify}, booktypeDvdRom=${job.options.booktypeDvdRom}`);
      if (job.options.booktypeDvdRom) {
        job.logs.push('Simulando booktype DVD-ROM... ✅ (mock).');
      }
      for (let i = 1; i <= 10; i++) {
        if (job.abortController.signal.aborted) {
          throw new Error('AbortError');
        }
        await new Promise(res => setTimeout(res, 1000));
        job.progress = i * 10;
        job.logs.push(`Simulação Progresso: ${job.progress}%`);
        job.updatedAt = new Date();
      }
      if (job.options.verify) {
        job.logs.push('Simulando verificação do disco... ✅ OK (mock).');
      }
      job.logs.push('Simulação concluída com sucesso.');
      return;
    }

    const opts = job.options;
    let command = '';
    let args: string[] = [];

    if (job.type === 'ps1') {
      command = 'cdrdao';
      args = [
        'write',
        '--device', config.driveDevice,
        '--driver', 'generic-mmc',
        '--speed', String(opts.speed ?? 8),
      ];
      if (opts.dummy) args.push('--simulate');
      if (opts.eject) args.push('--eject');
      if (opts.burnfree) args.push('--buffer-under-run-protection', '1');
      args.push(job.file);
    } else {
      // PS2 = imagem ISO gravada em DVD.
      // O leitor do PS2 só reconhece o disco como "formato PlayStation" se ele
      // estiver finalizado/fechado corretamente. O growisofs com -dvd-compat
      // grava o lead-out e fecha o disco, ao contrário do wodim -data (que
      // costuma gerar discos que o console rejeita com "please insert a
      // playstation or playstation2 format disc").
      command = 'growisofs';
      args = ['-dvd-compat'];
      if (opts.dummy) args.push('-use-the-force-luke=dummy');
      args.push(`-speed=${opts.speed ?? 4}`);
      // -Z grava uma sessão inicial a partir de uma imagem pronta
      args.push('-Z', `${config.driveDevice}=${job.file}`);
    }

    // Loga as informações da mídia (Media ID, velocidades suportadas) antes de gravar.
    // Ajuda a diagnosticar discos "marginais" e a entender a velocidade real escolhida.
    if (job.type === 'ps2') {
      await BurnService.logMediaInfo(job);
      if (opts.booktypeDvdRom) {
        await BurnService.setBookType(job);
      }
    }

    job.logs.push(`Comando: ${command} ${args.join(' ')}`);

    try {
      const result = await ShellService.execute(command, args, {
        signal: job.abortController.signal,
        onOut: (chunk) => {
          job.logs.push(chunk.trim());
          BurnService.updateProgress(job, chunk);
          job.updatedAt = new Date();
        },
        onErr: (chunk) => {
          job.logs.push(`[err] ${chunk.trim()}`);
          BurnService.updateProgress(job, chunk);
          job.updatedAt = new Date();
        }
      });

      if (result.code !== 0 && result.code !== null) {
        throw new Error(`Processo terminou com código de saída falho: ${result.code}`);
      }

      job.progress = 100;

      // Verificação (PS2/DVD): lê o disco de volta e compara com a imagem
      if (job.type === 'ps2' && opts.verify) {
        await BurnService.verifyBurn(job);
      }

      // growisofs não ejeta sozinho; faz best-effort após sucesso (cdrdao usa --eject)
      if (job.type === 'ps2' && opts.eject) {
        await BurnService.ejectTray(job);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'AbortError') {
        throw new Error('Cancelado pelo usuário.');
      }
      throw err;
    }
  }
}
