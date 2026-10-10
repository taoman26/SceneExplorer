import test from 'node:test';
import assert from 'node:assert/strict';
import { describeClientBuild } from './buildinfo.js';

const files = (map) => (f) => { if (f in map) return map[f]; throw new Error('ENOENT'); };
const INFO = '/client/dist/BUILD_INFO.txt';

// A fake git: `calls` are the git-command invocations seen, in order, so tests can assert what was actually run.
function fakeGit(script) {
  const calls = [];
  const git = (args, cwd) => {
    calls.push({ args, cwd });
    const result = script(args);
    if (result instanceof Error) throw result;
    return result;
  };
  return { git, calls };
}

test('no BUILD_INFO.txt -> null (an old build, or dist/ copied without it)', () => {
  assert.equal(describeClientBuild('/client/dist', '/server', { git: () => 'abc', readFile: files({}) }), null);
});

test('matching commit -> not stale, no further git calls needed', () => {
  const { git, calls } = fakeGit((args) => (args[0] === 'rev-parse' && args[1] === 'HEAD' ? 'abc123' : new Error('unexpected')));
  const r = describeClientBuild('/client/dist', '/server', { readFile: files({ [INFO]: 'abc123\n2026-01-01T00:00:00.000Z\n' }), git });
  assert.deepEqual(r, { commit: 'abc123', builtAt: '2026-01-01T00:00:00.000Z', current: 'abc123', stale: false });
  assert.equal(calls.length, 1); // just the HEAD check; no ancestor/log calls for an exact match
});

test('different commit, but the only commit(s) since are dist-only (e.g. "commit a prebuilt dist/") -> not stale', () => {
  const { git } = fakeGit((args) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'new222';
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo';
    if (args[0] === 'merge-base') return ''; // exits 0: is an ancestor
    if (args[0] === 'log') return ''; // no commits touched client source (besides dist/) in old111..new222
    throw new Error('unexpected: ' + args.join(' '));
  });
  const r = describeClientBuild('/client/dist', '/server', {
    readFile: files({ [INFO]: 'old111\n2025-06-01T00:00:00.000Z\n' }), git,
  });
  assert.deepEqual(r, { commit: 'old111', builtAt: '2025-06-01T00:00:00.000Z', current: 'new222', stale: false });
});

test('different commit, and a later commit touched client source -> stale', () => {
  const { git } = fakeGit((args) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'new222';
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo';
    if (args[0] === 'merge-base') return '';
    if (args[0] === 'log') return 'd3adbee webui: add shuffle button';
    throw new Error('unexpected: ' + args.join(' '));
  });
  const r = describeClientBuild('/client/dist', '/server', {
    readFile: files({ [INFO]: 'old111\n2025-06-01T00:00:00.000Z\n' }), git,
  });
  assert.equal(r.stale, true);
});

test('the log check excludes dist/ itself (checked via the exact pathspec passed to git)', () => {
  const { git, calls } = fakeGit((args) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'new222';
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo';
    if (args[0] === 'merge-base') return '';
    if (args[0] === 'log') return '';
    throw new Error('unexpected');
  });
  describeClientBuild('/client/dist', '/server', { readFile: files({ [INFO]: 'old111\nX\n' }), git });
  const log = calls.find((c) => c.args[0] === 'log');
  assert.deepEqual(log.args.slice(-2), ['webui/client', ':!webui/client/dist']);
  assert.equal(log.cwd, '/repo'); // run at the repo root, not serverDir, so the plain pathspecs above are unambiguous
});

test('built commit is not an ancestor of HEAD (diverged/unknown history) -> stale (conservative)', () => {
  const { git } = fakeGit((args) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'new222';
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo';
    if (args[0] === 'merge-base') throw new Error('exit 1: not an ancestor');
    throw new Error('unexpected: ' + args.join(' '));
  });
  const r = describeClientBuild('/client/dist', '/server', { readFile: files({ [INFO]: 'old111\nX\n' }), git });
  assert.equal(r.stale, true);
});

test('not a git checkout at all (HEAD lookup throws) -> current null, never reported stale', () => {
  const r = describeClientBuild('/client/dist', '/server', {
    readFile: files({ [INFO]: 'old111\n2025-06-01T00:00:00.000Z\n' }), git: () => { throw new Error('not a git repo'); },
  });
  assert.deepEqual(r, { commit: 'old111', builtAt: '2025-06-01T00:00:00.000Z', current: null, stale: false });
});

test('BUILD_INFO written without a resolvable commit ("unknown") -> never reported stale', () => {
  const r = describeClientBuild('/client/dist', '/server', {
    readFile: files({ [INFO]: 'unknown\n2025-06-01T00:00:00.000Z\n' }), git: () => 'new222',
  });
  assert.equal(r.stale, false);
});
