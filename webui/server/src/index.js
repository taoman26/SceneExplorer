import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { describeClientBuild } from './buildinfo.js';
import { listenUrls } from './netinfo.js';

const config = loadConfig();
const app = createApp(config);

function onListenError(e) {
  console.error(e.code === 'EADDRINUSE' ? `Port ${config.port} is already in use (set SE_PORT).` : `Server error: ${e.message}`);
  process.exit(1);
}

// Express 5 also passes listen() failures to this callback.
const server = app.listen(config.port, config.host, (err) => {
  if (err) return onListenError(err);
  console.log('SceneExplorer WebUI is running. Open one of:');
  for (const u of listenUrls(config.host, config.port)) console.log(`  ${u}`);
  console.log(`Library DB : ${path.join(config.dbDir, 'db.sqlite3')}`);
  console.log(`Document   : ${config.docFile}`);
  for (const [what, file] of [['library DB', path.join(config.dbDir, 'db.sqlite3')], ['document', config.docFile]]) {
    if (!fs.existsSync(file)) console.warn(`WARNING: ${what} not found (${file}). Run SceneExplorer once, or set SE_DB_DIR / SE_DOC_FILE.`);
  }
  if (!fs.existsSync(path.join(config.clientDir, 'index.html'))) {
    console.warn(`WARNING: web client not built (${config.clientDir}). Run "npm run build" in webui/client (or webui/start.sh).`);
  } else {
    const build = describeClientBuild(config.clientDir, path.dirname(fileURLToPath(import.meta.url)));
    const short = (h) => (h && h !== 'unknown' ? h.slice(0, 7) : h ?? '?');
    if (!build) {
      console.log('Web client : built before this version check existed, or dist/ was copied without BUILD_INFO.txt');
    } else if (build.stale) {
      console.warn(`WARNING: web client (${short(build.commit)}, built ${build.builtAt}) does not match the running server (${short(build.current)}).`);
      console.warn('         Rebuild the client (cd webui/client && npm run build); if it was built on another machine, copy client/dist over again.');
    } else {
      console.log(`Web client : built from ${short(build.commit)} at ${build.builtAt}`);
    }
  }
  if (app.locals.db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
    console.warn('NOTICE: no users exist yet. The first visitor can create the administrator account - open the URL above NOW.');
  }
});

server.on('error', onListenError);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => { app.locals.db.close(); process.exit(0); }); server.closeAllConnections?.(); });
}
