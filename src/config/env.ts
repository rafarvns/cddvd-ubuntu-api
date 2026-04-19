import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '48271', 10),
  isosDir: process.env.ISOS_DIR || '/home/rafarvns/isos',
  driveDevice: process.env.DRIVE_DEVICE || '/dev/sr0',
  isWindows: process.platform === 'win32',
};

// Garantir caminho absoluto se relativo
if (!path.isAbsolute(config.isosDir)) {
  config.isosDir = path.resolve(process.cwd(), config.isosDir);
}
