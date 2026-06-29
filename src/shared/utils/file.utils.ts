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

export interface BrowseResult {
  path: string;                                   // caminho relativo atual ("" = raiz)
  parent: string | null;                          // caminho relativo do pai (null na raiz)
  dirs: string[];                                 // subdiretórios imediatos (caminhos relativos)
  files: { filename: string; type: MediaType }[]; // arquivos válidos imediatos (caminhos relativos)
}

export async function browseDir(relativePath = ''): Promise<BrowseResult | null> {
  const targetDir = getSafeDirPath(relativePath);
  if (targetDir === null) {
    return null;
  }

  const dirs: string[] = [];
  const files: { filename: string; type: MediaType }[] = [];

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(targetDir, entry.name);
      const relative = path.relative(config.isosDir, fullPath);
      if (entry.isDirectory()) {
        dirs.push(relative);
      } else if (isValidExtension(entry.name)) {
        const isPs1 = entry.name.toLowerCase().endsWith('.cue');
        files.push({ filename: relative, type: (isPs1 ? 'ps1' : 'ps2') as MediaType });
      }
    }
  } catch (err: any) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      return null;
    }
    throw err;
  }

  dirs.sort((a, b) => a.localeCompare(b));
  files.sort((a, b) => a.filename.localeCompare(b.filename));

  // Normalizar separadores para "/" (compatível com a navegação no frontend)
  const normalizedPath = path.relative(config.isosDir, targetDir).split(path.sep).join('/');
  const parent = normalizedPath ? normalizedPath.split('/').slice(0, -1).join('/') : null;

  return {
    path: normalizedPath,
    parent,
    dirs: dirs.map((d) => d.split(path.sep).join('/')),
    files: files.map((f) => ({ ...f, filename: f.filename.split(path.sep).join('/') })),
  };
}

// Resolve um caminho de diretório relativo garantindo que está dentro de ISOS_DIR
export function getSafeDirPath(relativePath: string): string | null {
  const base = path.resolve(config.isosDir);
  const fullPath = path.resolve(base, relativePath);

  if (fullPath !== base && !fullPath.startsWith(base + path.sep)) {
    return null;
  }

  return fullPath;
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
