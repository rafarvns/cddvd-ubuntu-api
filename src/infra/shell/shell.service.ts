import { spawn } from 'child_process';
import { logger } from '../../shared/utils/logger';

export interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export class ShellService {
  /**
   * Executa um sistema em shell passando os logs para as chamadas de callback (se existirem)
   */
  static async execute(
    command: string,
    args: string[],
    options?: {
      signal?: AbortSignal;
      onOut?: (data: string) => void;
      onErr?: (data: string) => void;
    }
  ): Promise<SpawnResult> {
    return new Promise((resolve, reject) => {
      logger.info(`Executando comando: ${command} ${args.join(' ')}`);

      const child = spawn(command, args, {
        signal: options?.signal,
        shell: false, 
        detached: true, // Garante que o processo tenha seu próprio process group
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        if (options?.onOut) options.onOut(str);
      });

      child.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        if (options?.onErr) options.onErr(str);
      });

      child.on('close', (code) => {
        if (code !== 0 && code !== null) {
          logger.warn(`Processo finalizado com exit code não nulo: ${code}`);
        } else {
          logger.info(`Processo finalizado com exit code: ${code}`);
        }
        resolve({ stdout, stderr, code });
      });

      child.on('error', (err) => {
        if (err.name === 'AbortError') {
          logger.warn('Comando abortado via signal');
          return resolve({ stdout, stderr, code: 130 }); // 130 commonly used for terminated by signal
        }
        logger.error({ err }, 'Erro desconhecido ao rodar comando spawn');
        reject(err);
      });
    });
  }
}
