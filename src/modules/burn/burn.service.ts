import fs from 'fs/promises';
import { ShellService } from '../../infra/shell/shell.service';
import { BurnJob } from '../../shared/types/burn.types';
import { config } from '../../config/env';

export class BurnService {
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

    let command = '';
    let args: string[] = [];

    if (job.type === 'ps1') {
      command = 'cdrdao';
      args = [
        'write',
        '--device', config.driveDevice,
        '--driver', 'generic-mmc',
        '--speed', '8',
        job.file
      ];
    } else {
      command = 'wodim';
      args = [
        `dev=${config.driveDevice}`,
        'speed=4',
        '-v',
        'driveropts=burnfree',
        '-data',
        job.file
      ];
    }

    try {
      const result = await ShellService.execute(command, args, {
        signal: job.abortController.signal,
        onOut: (chunk) => {
          job.logs.push(chunk.trim());
          // TODO: Parse progress matching stdout patterns
          job.updatedAt = new Date();
        },
        onErr: (chunk) => {
          job.logs.push(`[err] ${chunk.trim()}`);
          job.updatedAt = new Date();
        }
      });

      if (result.code !== 0 && result.code !== null) {
        throw new Error(`Processo terminou com código de saída falho: ${result.code}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'AbortError') {
        throw new Error('Cancelado pelo usuário.');
      }
      throw err;
    }
  }
}
