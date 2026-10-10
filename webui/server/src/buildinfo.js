import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Compares the running server's git commit against the one client/dist was built from (BUILD_INFO.txt, written by
// the client's "postbuild" script — see webui/client/write-build-info.mjs). Node versions too old to build the
// client (see start.sh) have to build it elsewhere and copy dist/ over; this lets a stale copy be spotted at a
// glance in the startup log instead of silently serving old JS forever. Returns null if dist/ predates this check.
export function describeClientBuild(clientDir, serverDir, overrides) {
  overrides = overrides || {};
  const readFile = overrides.readFile || fs.readFileSync;
  const gitHead = overrides.gitHead || function gitHead(dir) {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  };
  let commit;
  let builtAt;
  try {
    const parts = readFile(path.join(clientDir, 'BUILD_INFO.txt'), 'utf8').trim().split('\n');
    commit = parts[0];
    builtAt = parts[1];
  } catch (e) {
    return null; // no BUILD_INFO.txt
  }
  let current = null;
  try { current = gitHead(serverDir); } catch (e) { /* not a git checkout (e.g. extracted from an archive) */ }
  return { commit: commit, builtAt: builtAt, current: current, stale: !!(current && commit !== 'unknown' && current !== commit) };
}
