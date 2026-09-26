import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(env = process.env) {
  const home = os.homedir();
  return {
    host: env.SE_HOST || '0.0.0.0',
    port: Number(env.SE_PORT || 8686),
    dbDir: env.SE_DB_DIR || path.join(home, '.local/share/Ambiesoft/SceneExplorer'),
    docFile: env.SE_DOC_FILE || path.join(home, 'Documents/SceneExplorer/default.scexd'),
    clientDir: env.SE_CLIENT_DIR || path.join(here, '../../client/dist'),
    dataDir: env.SE_DATA_DIR || path.join(here, '../../data'),
  };
}
