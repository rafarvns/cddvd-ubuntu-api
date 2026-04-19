import { EventEmitter } from 'events';
import { BurnJob } from '../../shared/types/burn.types';
import { logger } from '../../shared/utils/logger';

export type ProcessFunction = (job: BurnJob) => Promise<void>;

class BurnQueue extends EventEmitter {
  private queue: BurnJob[] = [];
  private activeJob: BurnJob | null = null;
  private isProcessing: boolean = false;
  private processor?: ProcessFunction;

  // Manter os jobs em memória
  private history: Map<string, BurnJob> = new Map();

  setProcessor(processor: ProcessFunction) {
    this.processor = processor;
    this.processQueue();
  }

  addJob(job: BurnJob) {
    this.queue.push(job);
    this.history.set(job.id, job);
    this.emit('jobAdded', job);
    this.processQueue();
  }

  getJob(id: string): BurnJob | undefined {
    return this.history.get(id);
  }

  getAllJobs(): BurnJob[] {
    return Array.from(this.history.values());
  }

  getActiveJob(): BurnJob | null {
    return this.activeJob;
  }

  cancelJob(id: string): boolean {
    const job = this.history.get(id);
    if (!job) return false;

    if (job.status === 'pending') {
      job.status = 'error';
      job.logs.push('Cancelado antes de iniciar.');
      job.updatedAt = new Date();
      // Remover da fila fisicamente
      this.queue = this.queue.filter(j => j.id !== id);
      this.emit('jobUpdated', job);
      return true;
    } else if (job.status === 'running') {
      if (job.abortController) {
        logger.info(`Abortando job ${id}`);
        job.abortController.abort();
        return true;
      }
    }
    return false;
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0 || !this.processor) return;

    this.isProcessing = true;
    this.activeJob = this.queue.shift()!;
    this.activeJob.status = 'running';
    this.activeJob.startedAt = new Date();
    this.activeJob.updatedAt = new Date();
    
    this.emit('jobStarted', this.activeJob);
    logger.info(`Iniciando trabalho da fila: ${this.activeJob.id}`);

    try {
      await this.processor(this.activeJob);
      if (this.activeJob.status === 'running') {
        this.activeJob.status = 'success';
      }
    } catch (err: any) {
      this.activeJob.status = 'error';
      this.activeJob.logs.push(`Erro interno: ${err?.message || err}`);
      logger.error({ id: this.activeJob.id, err }, 'Job falhou');
    } finally {
      this.activeJob.finishedAt = new Date();
      this.activeJob.updatedAt = new Date();
      this.emit('jobFinished', this.activeJob);
      logger.info(`Trabalho finalizado: ${this.activeJob.id} com status ${this.activeJob.status}`);
      
      this.activeJob = null;
      this.isProcessing = false;
      
      setImmediate(() => this.processQueue());
    }
  }
}

export const burnQueue = new BurnQueue();
