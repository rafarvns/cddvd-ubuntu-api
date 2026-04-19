import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { config } from './config/env';
import { logger } from './shared/utils/logger';
import { burnRouter } from './modules/burn/burn.controller';
import { driveRouter } from './modules/drive/drive.controller';

const app = express();

// Garantir diretório de logs
const jobsLogDir = path.join(process.cwd(), 'logs', 'jobs');
if (!fs.existsSync(jobsLogDir)) {
  fs.mkdirSync(jobsLogDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '../public')));

// Fallback para o index.html na raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Main Routes
app.use('/api', burnRouter);
app.use('/api/drive', driveRouter);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    isWindowsMockMode: config.isWindows,
    isosDir: config.isosDir,
    device: config.driveDevice
  });
});

app.listen(config.port, () => {
  logger.info(`🔥 Servidor Node.js iniciado na porta ${config.port}`);
  logger.info(`📂 Diretório Mapeado (ISOs/CUEs): ${config.isosDir}`);
  logger.info(`💿 Dispositivo do Lase/Gravador: ${config.driveDevice}`);
  if (config.isWindows) {
    logger.warn('🚧 Rodando no ambiente Windows: Comandos nativos serão simulados (MockMode).');
  }
});
