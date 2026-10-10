import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

function defaultGit(args, cwd) {
  return execFileSync('git', args, { cwd: cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

// Compares the running server's git commit against the one client/dist was built from (BUILD_INFO.txt, written by
// the client's "postbuild" script — see webui/client/write-build-info.mjs). This branch builds the client
// elsewhere (Node < 20.19 here can't run Vite) and either copies dist/ over or commits a prebuilt one straight
// into the branch; this lets a stale one be spotted at a glance in the startup log instead of silently serving
// old JS forever. Returns null if dist/ predates this check (no BUILD_INFO.txt).
//
// A plain commit-hash comparison would false-positive on the very commit that *adds* a prebuilt dist/: that commit
// can't embed its own hash (it doesn't exist yet at build time), so BUILD_INFO necessarily names its parent. So:
// a different hash isn't itself "stale" — only a commit that actually touched the client source (excluding dist/,
// the generated output) somewhere after the build is.
export function describeClientBuild(clientDir, serverDir, overrides) {
  overrides = overrides || {};
  var readFile = overrides.readFile || fs.readFileSync;
  var git = overrides.git || defaultGit;

  var commit;
  var builtAt;
  try {
    var parts = readFile(path.join(clientDir, 'BUILD_INFO.txt'), 'utf8').trim().split('\n');
    commit = parts[0];
    builtAt = parts[1];
  } catch (e) {
    return null;
  }

  var current = null;
  try { current = git(['rev-parse', 'HEAD'], serverDir); } catch (e) { /* not a git checkout */ }
  if (!current || commit === 'unknown' || current === commit) {
    return { commit: commit, builtAt: builtAt, current: current, stale: false };
  }

  var stale = true; // default: can't establish the relationship, so stay conservative
  try {
    var root = git(['rev-parse', '--show-toplevel'], serverDir);
    git(['merge-base', '--is-ancestor', commit, current], root); // throws (nonzero exit) if not an ancestor
    var changed = git(['log', '--oneline', commit + '..' + current, '--', 'webui/client', ':!webui/client/dist'], root);
    stale = changed.length > 0;
  } catch (e) { /* not an ancestor, unknown commit, or git error: leave stale = true */ }

  return { commit: commit, builtAt: builtAt, current: current, stale: stale };
}
