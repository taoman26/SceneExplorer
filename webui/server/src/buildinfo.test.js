import test from 'node:test';
import assert from 'node:assert/strict';
import { describeClientBuild } from './buildinfo.js';

const files = (map) => (f) => { if (f in map) return map[f]; throw new Error('ENOENT'); };
const INFO = '/client/dist/BUILD_INFO.txt';

test('no BUILD_INFO.txt -> null (an old build, or dist/ copied without it)', () => {
  assert.equal(describeClientBuild('/client/dist', '/server', { readFile: files({}), gitHead: () => 'abc' }), null);
});

test('matching commit -> not stale', () => {
  const r = describeClientBuild('/client/dist', '/server', {
    readFile: files({ [INFO]: 'abc123\n2026-01-01T00:00:00.000Z\n' }), gitHead: () => 'abc123',
  });
  assert.deepEqual(r, { commit: 'abc123', builtAt: '2026-01-01T00:00:00.000Z', current: 'abc123', stale: false });
});

test('different commit -> stale, both hashes reported', () => {
  const r = describeClientBuild('/client/dist', '/server', {
    readFile: files({ [INFO]: 'old111\n2025-06-01T00:00:00.000Z\n' }), gitHead: () => 'new222',
  });
  assert.deepEqual(r, { commit: 'old111', builtAt: '2025-06-01T00:00:00.000Z', current: 'new222', stale: true });
});

test('not a git checkout (gitHead throws) -> current null, never reported stale', () => {
  const r = describeClientBuild('/client/dist', '/server', {
    readFile: files({ [INFO]: 'old111\n2025-06-01T00:00:00.000Z\n' }), gitHead: () => { throw new Error('not a git repo'); },
  });
  assert.deepEqual(r, { commit: 'old111', builtAt: '2025-06-01T00:00:00.000Z', current: null, stale: false });
});

test('BUILD_INFO written without a resolvable commit ("unknown") -> never reported stale', () => {
  const r = describeClientBuild('/client/dist', '/server', {
    readFile: files({ [INFO]: 'unknown\n2025-06-01T00:00:00.000Z\n' }), gitHead: () => 'new222',
  });
  assert.equal(r.stale, false);
});
