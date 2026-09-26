import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app.js';
import { makeFixture, VIDEO_BYTES, DBID } from './fixtures.js';
import { hashPassword } from './password.js';

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'SceneExplorer' };

async function withApp(fn) {
  const fx = makeFixture();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-test-'));
  const app = createApp({ ...fx.config, dataDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/auth/setup`, { method: 'POST', headers: H,
    body: JSON.stringify({ username: 'admin', password: 'password123' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = (p, headers = {}) => fetch(base + p, { headers: { cookie, ...headers } });
  const access = (id, dbid = DBID) => {
    const d = new DatabaseSync(fx.config.docFile, { readOnly: true });
    try { return d.prepare('SELECT opencount, lastaccess FROM Access WHERE id=? AND dbid=?').get(id, dbid); } finally { d.close(); }
  };
  try { await fn({ get, base, fx, access, app }); } finally {
    server.close(); app.locals.db.close(); fx.cleanup(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
const bytes = async (r) => Buffer.from(await r.arrayBuffer());

test('thumb/stream require login', () => withApp(async ({ base }) => {
  assert.equal((await fetch(`${base}/api/videos/1/thumb/1`)).status, 401);
  assert.equal((await fetch(`${base}/api/videos/1/stream`)).status, 401);
}));

test('thumbnail: bytes, type, caching; bad n / id / missing -> 404', () => withApp(async ({ get }) => {
  const r = await get('/api/videos/2/thumb/10');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.match(r.headers.get('cache-control'), /private/);
  assert.equal((await bytes(r)).toString(), 'dummy2-10');
  for (const p of ['/api/videos/1/thumb/4', '/api/videos/1/thumb/0', '/api/videos/1/thumb/abc',
    '/api/videos/1/thumb/..%2f..%2fx', '/api/videos/999/thumb/1', '/api/videos/abc/thumb/1']) {
    assert.equal((await get(p)).status, 404, p);
  }
}));

test('stream: full body with Accept-Ranges', () => withApp(async ({ get }) => {
  const r = await get('/api/videos/1/stream');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('accept-ranges'), 'bytes');
  assert.equal(r.headers.get('content-type'), 'video/mp4');
  assert.deepEqual(await bytes(r), VIDEO_BYTES);
}));

test('stream: Range requests (206), open-ended, suffix, unsatisfiable (416)', () => withApp(async ({ get }) => {
  let r = await get('/api/videos/1/stream', { Range: 'bytes=10-19' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 10-19/1000');
  assert.deepEqual(await bytes(r), VIDEO_BYTES.subarray(10, 20));
  r = await get('/api/videos/1/stream', { Range: 'bytes=990-' });
  assert.deepEqual(await bytes(r), VIDEO_BYTES.subarray(990));
  r = await get('/api/videos/1/stream', { Range: 'bytes=-5' });
  assert.deepEqual(await bytes(r), VIDEO_BYTES.subarray(995));
  r = await get('/api/videos/1/stream', { Range: 'bytes=5000-6000' });
  assert.equal(r.status, 416);
}));

test('stream: missing file / unknown id -> 404, no crash', () => withApp(async ({ get, access }) => {
  const r = await get('/api/videos/5/stream');
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: 'file_unavailable' });
  assert.equal((await get('/api/videos/999/stream')).status, 404);
  assert.equal(access(5), undefined); // unavailable file is not counted
}));

test('download=1 sets attachment with safe filename and does not count', () => withApp(async ({ get, access }) => {
  const r = await get('/api/videos/2/stream?download=1');
  assert.equal(r.status, 200);
  const cd = r.headers.get('content-disposition');
  assert.match(cd, /^attachment; filename="Beta_100%_done\.mp4"; filename\*=UTF-8''Beta_100%25_done\.mp4$/);
  await r.arrayBuffer();
  assert.equal(access(2).opencount, 7);
}));

test('open count: existing row +1, new row created, deduped, other dbid untouched', () => withApp(async ({ get, access }) => {
  const before = Math.floor(Date.now() / 1000);
  await (await get('/api/videos/2/stream')).arrayBuffer();
  await (await get('/api/videos/2/stream', { Range: 'bytes=0-' })).arrayBuffer();
  await (await get('/api/videos/2/stream', { Range: 'bytes=500-' })).arrayBuffer();
  const a2 = access(2);
  assert.equal(a2.opencount, 8); // 7 -> 8 once, not 3 times
  assert.ok(a2.lastaccess >= before);

  assert.equal(access(4), undefined);
  await (await get('/api/videos/4/stream')).arrayBuffer();
  assert.equal(access(4).opencount, 1);

  // the same id under another library's dbid is a different row
  assert.equal(access(1, 'another-dbid').opencount, 99);
  await (await get('/api/videos/1/stream')).arrayBuffer();
  assert.equal(access(1, 'another-dbid').opencount, 99);
  assert.equal(access(1).opencount, 1);
}));

test('viewer role streams but is not counted', () => withApp(async ({ base, app, access }) => {
  app.locals.db.prepare("INSERT INTO users (username, pw_hash, role, created_at) VALUES ('v', ?, 'viewer', 0)")
    .run(await hashPassword('viewerpass1'));
  const l = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: H,
    body: JSON.stringify({ username: 'v', password: 'viewerpass1' }) });
  const cookie = l.headers.get('set-cookie').split(';')[0];
  const r = await fetch(`${base}/api/videos/4/stream`, { headers: { cookie } });
  assert.equal(r.status, 200);
  await r.arrayBuffer();
  assert.equal(access(4), undefined);
}));

test('playback still works when the Qt document is read-only (count silently skipped)', () => withApp(async ({ get, fx, access }) => {
  fs.chmodSync(fx.config.docFile, 0o444);
  const r = await get('/api/videos/4/stream');
  assert.equal(r.status, 200);
  assert.deepEqual(await bytes(r), VIDEO_BYTES);
  assert.equal(access(4), undefined);
}));
