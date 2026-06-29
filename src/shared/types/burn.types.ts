export type MediaType = 'ps1' | 'ps2';
export type JobStatus = 'pending' | 'running' | 'success' | 'error';

export interface BurnOptions {
  speed?: number;     // velocidade de gravação (x). Se ausente, usa o padrão por tipo de mídia
  dummy: boolean;     // modo teste: simula a gravação sem queimar o disco
  eject: boolean;     // ejeta a bandeja ao concluir
  burnfree: boolean;  // proteção contra buffer underrun (burnfree)
}

export interface BurnJob {
  id: string;
  file: string;
  type: MediaType;
  options: BurnOptions;
  status: JobStatus;
  progress: number; // 0-100
  logs: string[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  abortController?: AbortController;
}
