import fs from 'fs/promises';
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
      job.logs.push(`Opções: speed=${job.options.speed ?? 'auto'}, dummy=${job.options.dummy}, eject=${job.options.eject}, burnfree=${job.options.burnfree}`);
      for (let i = 1; i <= 10; i++) {
        if (job.abortController.signal.aborted) {
          throw new Error('AbortError');
        }
        await new Promise(res => setTimeout(res, 1000));
        job.progress = i * 10;
        job.logs.push(`Simulação Progresso: ${job.progress}%`);
        job.updatedAt = new Date();
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

      // growisofs não ejeta sozinho; faz best-effort após sucesso (cdrdao usa --eject)
      if (job.type === 'ps2' && opts.eject) {
        try {
          await ShellService.execute('eject', [config.driveDevice]);
        } catch {
          job.logs.push('[warn] Falha ao ejetar a bandeja (gravação concluída mesmo assim).');
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'AbortError') {
        throw new Error('Cancelado pelo usuário.');
      }
      throw err;
    }
  }
}
