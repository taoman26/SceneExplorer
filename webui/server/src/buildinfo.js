import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const defaultGit = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

// Compares the running server's git commit against the one client/dist was built from (BUILD_INFO.txt, written by
// the client's "postbuild" script — see webui/client/write-build-info.mjs). Node versions too old to build the
// client (see start.sh) have to build it elsewhere and copy dist/ over, or commit a prebuilt dist/ straight into a
// branch (see webui-node12); this lets a stale one be spotted at a glance in the startup log instead of silently
// serving old JS forever. Returns null if dist/ predates this check (no BUILD_INFO.txt).
//
// A plain commit-hash comparison would false-positive on the very commit that *adds* a prebuilt dist/: that commit
// can't embed its own hash (it doesn't exist yet at build time), so BUILD_INFO necessarily names its parent. So:
// a different hash isn't itself "stale" — only a commit that actually touched the client source (excluding dist/,
// the generated output) somewhere after the build is.
export function describeClientBuild(clientDir, serverDir, { readFile = fs.readFileSync, git = defaultGit } = {}) {
  let commit;
  let builtAt;
  try {
    [commit, builtAt] = readFile(path.join(clientDir, 'BUILD_INFO.txt'), 'utf8').trim().split('\n');
  } catch {
    return null;
  }

  let current = null;
  try { current = git(['rev-parse', 'HEAD'], serverDir); } catch { /* not a git checkout */ }
  if (!current || commit === 'unknown' || current === commit) {
    return { commit, builtAt, current, stale: false };
  }

  let stale = true; // default: can't establish the relationship, so stay conservative
  try {
    const root = git(['rev-parse', '--show-toplevel'], serverDir);
    git(['merge-base', '--is-ancestor', commit, current], root); // throws (nonzero exit) if not an ancestor
    const changed = git(['log', '--oneline', `${commit}..${current}`, '--', 'webui/client', ':!webui/client/dist'], root);
    stale = changed.length > 0;
  } catch { /* not an ancestor, unknown commit, or git error: leave stale = true */ }

  return { commit, builtAt, current, stale };
}
