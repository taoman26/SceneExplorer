import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Compares the running server's git commit against the one client/dist was built from (BUILD_INFO.txt, written by
// the client's "postbuild" script — see webui/client/write-build-info.mjs). Node versions too old to build the
// client (see start.sh) have to build it elsewhere and copy dist/ over; this lets a stale copy be spotted at a
// glance in the startup log instead of silently serving old JS forever. Returns null if dist/ predates this check.
export function describeClientBuild(clientDir, serverDir, { readFile = fs.readFileSync, gitHead = (dir) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim() } = {}) {
  let commit;
  let builtAt;
  try {
    [commit, builtAt] = readFile(path.join(clientDir, 'BUILD_INFO.txt'), 'utf8').trim().split('\n');
  } catch {
    return null; // no BUILD_INFO.txt
  }
  let current = null;
  try { current = gitHead(serverDir); } catch { /* not a git checkout (e.g. extracted from an archive) */ }
  return { commit, builtAt, current, stale: !!(current && commit !== 'unknown' && current !== commit) };
}
