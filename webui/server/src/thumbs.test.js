import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { makeFixture } from './fixtures.js';

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'SceneExplorer' };

async function withApp(fn) {
  const fx = makeFixture();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-test-'));
  const app = createApp({ ...fx.config, dataDir, thumbRescanMs: 0 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/auth/setup`, { method: 'POST', headers: H, body: JSON.stringify({ username: 'admin', password: 'password123' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = (p) => fetch(base + p, { headers: { cookie } });
  const put = (name, body) => fs.writeFileSync(path.join(fx.config.dbDir, 'thumbs', name), body);
  try { await fn({ get, put }); } finally { server.close(); app.locals.db.close(); fx.cleanup(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}

test("Qt default size (240x180) has no size in the file name: <thumbid>-<N>.jpg", () => withApp(async ({ get, put }) => {
  for (let i = 1; i <= 5; i++) put(`thumb-4-${i}.jpg`, `default4-${i}`);
  const r = await get('/api/videos/4/thumb/3');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'default4-3');
  assert.equal((await (await get('/api/videos/4')).json()).thumbCount, 5);
  assert.equal((await get('/api/videos/4/thumb/6')).status, 404);
}));

test('a custom size other than 187x140 is learned from the directory', () => withApp(async ({ get, put }) => {
  for (let i = 1; i <= 3; i++) put(`thumb-3-320x240-${i}.jpg`, `big3-${i}`);
  const r = await get('/api/videos/3/thumb/2');
  assert.equal(await r.text(), 'big3-2');
  assert.equal((await (await get('/api/videos/3')).json()).thumbCount, 3);
}));

test('a library can mix name forms; each video resolves independently; existing 187x140 still works', () => withApp(async ({ get, put }) => {
  put('thumb-3-1.jpg', 'default3-1'); put('thumb-4-240x180-1.png', 'x'); // png with a size: wrong ext for video 4 (jpg) -> ignored
  assert.equal(await (await get('/api/videos/3/thumb/1')).text(), 'default3-1');
  assert.equal((await get('/api/videos/4/thumb/1')).status, 404);
  assert.equal(await (await get('/api/videos/1/thumb/1')).text(), 'dummy1-1'); // fixture: <id>-187x140-<n>
  assert.equal((await (await get('/api/videos/2')).json()).thumbCount, 10);
}));

test('a thumb id from another video is never matched by prefix', () => withApp(async ({ get, put }) => {
  put('thumb-40-1.jpg', 'other'); put('thumb-40-320x240-1.jpg', 'other2'); // "thumb-4" must not match "thumb-40-..."
  assert.equal((await get('/api/videos/4/thumb/1')).status, 404);
}));
