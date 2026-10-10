// Runs after `npm run build` (npm's "postbuild" convention). Stamps dist/ with the commit it was built from, so
// a server started against a copied-over dist/ (see start.sh on Node versions too old to build the client) can
// tell at startup whether that dist/ actually matches the server code it's serving alongside.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: fileURLToPath(new URL('.', import.meta.url)) }).toString().trim(); } catch { /* not a git checkout */ }
writeFileSync('dist/BUILD_INFO.txt', `${commit}\n${new Date().toISOString()}\n`);
