import fs from 'fs/promises';
import path from 'path';
import { MediaType } from '../types/burn.types';
import { config } from '../../config/env';

export async function getFilesList() {
  const result: { filename: string; type: MediaType }[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (isValidExtension(entry.name)) {
        const relativePath = path.relative(config.isosDir, fullPath);
        const isPs1 = entry.name.toLowerCase().endsWith('.cue');
        result.push({
          filename: relativePath,
          type: (isPs1 ? 'ps1' : 'ps2') as MediaType
        });
      }
    }
  }

  try {
    await walk(config.isosDir);
    return result;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export function isValidExtension(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  return ext === '.cue' || ext === '.iso';
}

export function getSafeFilePath(filename: string): string | null {
  // Resolver caminho absoluto baseado na raiz das ISOs
  const fullPath = path.resolve(config.isosDir, filename);
  
  // Garantir que o caminho resolvido ainda está dentro do diretório base (prevenir ../)
  if (!fullPath.startsWith(path.resolve(config.isosDir))) {
    return null;
  }
  
  return fullPath;
}
