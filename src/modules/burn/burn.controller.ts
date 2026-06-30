import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getFilesList, getSafeFilePath, isValidExtension, browseDir } from '../../shared/utils/file.utils';
import { BurnJob, MediaType } from '../../shared/types/burn.types';
import { burnQueue } from './burn.queue';
import { BurnService } from './burn.service';

// Inicializar a rotina de workers
burnQueue.setProcessor(BurnService.processJob);

export const burnRouter = Router();

burnRouter.get('/files', async (req: Request, res: Response) => {
  try {
    const files = await getFilesList();
    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao ler diretório de arquivos ISOs/CUEs.', details: err?.message });
  }
});

burnRouter.get('/browse', async (req: Request, res: Response): Promise<any> => {
  try {
    const relativePath = typeof req.query.path === 'string' ? req.query.path : '';
    const result = await browseDir(relativePath);
    if (result === null) {
      return res.status(404).json({ error: 'Diretório não encontrado ou fora da raiz permitida.' });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao navegar no diretório.', details: err?.message });
  }
});

const burnSchema = z.object({
  file: z.string().min(1),
  options: z.object({
    speed: z.number().int().min(1).max(56).optional(),
    dummy: z.boolean().default(false),
    eject: z.boolean().default(false),
    burnfree: z.boolean().default(true),
    verify: z.boolean().default(true),
    booktypeDvdRom: z.boolean().default(true),
  }).prefault({}),
});

burnRouter.post('/burn', (req: Request, res: Response): any => {
  try {
    const parsed = burnSchema.parse(req.body);
    
    if (!isValidExtension(parsed.file)) {
      return res.status(400).json({ error: 'Extensão inválida. Apenas .iso ou .cue são auto gerenciáveis.' });
    }

    const safePath = getSafeFilePath(parsed.file);
    if (!safePath) {
      return res.status(400).json({ error: 'Caminho maliciosamente formado.' });
    }

    const isPs1 = parsed.file.toLowerCase().endsWith('.cue');

    const job: BurnJob = {
      id: crypto.randomUUID(),
      file: safePath,
      type: (isPs1 ? 'ps1' : 'ps2') as MediaType,
      options: parsed.options,
      status: 'pending',
      progress: 0,
      logs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    burnQueue.addJob(job);
    
    res.status(202).json({ 
      message: 'Trabalho de gravação enfileirado com sucesso.', 
      id: job.id 
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Campos incorretos na requisição' });
    }
    return res.status(500).json({ error: 'Erro fatal ao criar job' });
  }
});

burnRouter.get('/burn/:id', (req: Request, res: Response): any => {
  const job = burnQueue.getJob(req.params.id as string);
  
  if (!job) {
    return res.status(404).json({ error: 'Histórico ou gravação não encontrados' });
  }

  // Omitir propriedades sensíveis e não serializáveis
  const { abortController, ...publicJob } = job;
  res.json(publicJob);
});

burnRouter.post('/burn/:id/cancel', (req: Request, res: Response): any => {
  const canceled = burnQueue.cancelJob(req.params.id as string);
  
  if (canceled) {
    res.json({ message: `Sucesso. Enviado sinal de terminal ao job ${req.params.id}` });
  } else {
    res.status(400).json({ error: 'Não foi possível cancelar o job. Ele pode já ter terminado ou não existir.' });
  }
});

burnRouter.get('/history/all', (req: Request, res: Response) => {
  const history = burnQueue.getAllJobs().map(j => {
    const { abortController, ...publicJob } = j;
    return publicJob;
  });
  res.json(history);
});
