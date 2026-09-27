import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Parses the value of XDG_DOCUMENTS_DIR from ~/.config/user-dirs.dirs, e.g.
//   XDG_DOCUMENTS_DIR="$HOME/ドキュメント"     (the folder name depends on the desktop language)
// Only "$HOME/..." and absolute paths are valid in that file (same rule as Qt / xdg-user-dirs).
export function parseUserDirsDocuments(text, home) {
  let found = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*XDG_DOCUMENTS_DIR\s*=\s*(.*?)\s*$/.exec(raw);
    if (!m) continue; // comments and other keys
    let v = m[1];
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      v = v.slice(1, -1).replace(/\\(["\\$`])/g, '$1'); // shell escapes allowed inside double quotes
    } else if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
      v = v.slice(1, -1);
    }
    if (v === '$HOME' || v.startsWith('$HOME/')) v = home + v.slice('$HOME'.length);
    if (path.isAbsolute(v)) found = path.normalize(v); // the last valid definition wins
  }
  return found;
}

// The user's Documents folder as the Qt application sees it (QStandardPaths::DocumentsLocation):
// $XDG_DOCUMENTS_DIR, else ~/.config/user-dirs.dirs, else ~/Documents. Folder names are localized
// on many Linux desktops (e.g. ~/ドキュメント), so "Documents" must not be hard-coded.
export function documentsDir(env = process.env, home = os.homedir(), readFile = (f) => fs.readFileSync(f, 'utf8')) {
  if (env.XDG_DOCUMENTS_DIR && path.isAbsolute(env.XDG_DOCUMENTS_DIR)) return env.XDG_DOCUMENTS_DIR;
  const configHome = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(home, '.config');
  try {
    const dir = parseUserDirsDocuments(readFile(path.join(configHome, 'user-dirs.dirs')), home);
    if (dir) return dir;
  } catch { /* no user-dirs.dirs: fall through */ }
  return path.join(home, 'Documents');
}

export function loadConfig(env = process.env, { home = os.homedir(), readFile } = {}) {
  const dataHome = env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : path.join(home, '.local/share');
  return {
    host: env.SE_HOST || '0.0.0.0',
    port: Number(env.SE_PORT || 8686),
    dbDir: env.SE_DB_DIR || path.join(dataHome, 'Ambiesoft/SceneExplorer'),
    docFile: env.SE_DOC_FILE || path.join(documentsDir(env, home, readFile), 'SceneExplorer', 'default.scexd'),
    clientDir: env.SE_CLIENT_DIR || path.join(here, '../../client/dist'),
    dataDir: env.SE_DATA_DIR || path.join(here, '../../data'),
    playTokenTtlSec: Number(env.SE_PLAY_TOKEN_TTL_SEC || 6 * 3600),
  };
}
