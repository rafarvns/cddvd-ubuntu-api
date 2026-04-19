export type MediaType = 'ps1' | 'ps2';
export type JobStatus = 'pending' | 'running' | 'success' | 'error';

export interface BurnJob {
  id: string;
  file: string;
  type: MediaType;
  status: JobStatus;
  progress: number; // 0-100
  logs: string[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  abortController?: AbortController;
}
