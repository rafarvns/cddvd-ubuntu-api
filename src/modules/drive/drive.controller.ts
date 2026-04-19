import { Router, Request, Response } from 'express';
import { ShellService } from '../../infra/shell/shell.service';
import { config } from '../../config/env';

export const driveRouter = Router();

driveRouter.post('/eject', async (req: Request, res: Response): Promise<any> => {
  if (config.isWindows) {
    return res.json({ message: 'Comando "eject" não compatível/simulado no Windows.' });
  }

  try {
    const result = await ShellService.execute('eject', [config.driveDevice]);
    
    if (result.code === 0) {
      res.json({ message: 'Comando de ejetar gaveta enviado.' });
    } else {
      res.status(500).json({ 
        error: `Falha ao ejetar drive (${config.driveDevice}).`, 
        details: result.stderr 
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Erro FATAL ao chamar ejetor de gaveta.', details: err.message });
  }
});
