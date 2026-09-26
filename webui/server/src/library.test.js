import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { makeFixture } from './fixtures.js';

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'SceneExplorer' };

async function withApp(fn, { library = true } = {}) {
  const fx = makeFixture();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-test-'));
  const config = library ? { ...fx.config, dataDir } : { dbDir: '/nonexistent', docFile: '/nonexistent.scexd', dataDir };
  const app = createApp(config);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/auth/setup`, { method: 'POST', headers: H,
    body: JSON.stringify({ username: 'admin', password: 'password123' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const get = async (p) => { const res = await fetch(base + p, { headers: { cookie } }); return { status: res.status, body: await res.json() }; };
  try { await fn({ get, base, fx }); } finally {
    server.close(); app.locals.db.close(); fx.cleanup(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
const names = (b) => b.items.map((v) => v.name);

test('requires login', () => withApp(async ({ base }) => {
  assert.equal((await fetch(`${base}/api/videos`)).status, 401);
  assert.equal((await fetch(`${base}/api/dirs`)).status, 401);
}));

test('dirs: counts include subfolders, displaytext passed through', () => withApp(async ({ get }) => {
  const { body } = await get('/api/dirs');
  assert.deepEqual(body.map((d) => [d.id, d.count, d.displaytext]), [[1, 3, ''], [2, 2, 'B folder']]);
}));

test('tags: only this library, counts, untagged', () => withApp(async ({ get }) => {
  const { body } = await get('/api/tags');
  assert.deepEqual(body.tags.map((t) => [t.tag, t.count]), [['family', 1], ['travel', 2]]);
  assert.equal(body.untagged, 3); // videos 2,4,5
}));

test('videos: default sort is wtime desc, with opencount/tagids; other dbid ignored', () => withApp(async ({ get }) => {
  const { status, body } = await get('/api/videos');
  assert.equal(status, 200);
  assert.equal(body.total, 5);
  assert.deepEqual(body.items.map((v) => v.id), [5, 4, 2, 3, 1]);
  const v2 = body.items.find((v) => v.id === 2);
  assert.equal(v2.opencount, 7);
  assert.equal(body.items.find((v) => v.id === 1).opencount, 0); // Access row belongs to another dbid
  assert.deepEqual(body.items.find((v) => v.id === 3).tagids.sort(), [1, 2]);
  assert.equal(v2.path, v2.directory + v2.name);
}));

test('videos: sort keys and order', () => withApp(async ({ get }) => {
  assert.deepEqual((await get('/api/videos?sort=size&order=asc')).body.items.map((v) => v.id), [2, 3, 1, 4, 5]);
  assert.deepEqual((await get('/api/videos?sort=name&order=asc')).body.items.map((v) => v.id), [1, 2, 4, 3, 5]);
  assert.equal((await get('/api/videos?sort=opencount')).body.items[0].id, 2);
  // unknown sort must not reach SQL
  assert.equal((await get('/api/videos?sort=name;DROP TABLE FileInfo')).status, 200);
}));

test('videos: search is AND over terms, case-insensitive, and escapes % _', () => withApp(async ({ get }) => {
  assert.deepEqual(names((await get('/api/videos?q=holiday')).body), ['gamma holiday trip.mp4', 'alpha holiday.mp4']);
  assert.deepEqual(names((await get('/api/videos?q=HOLIDAY+trip')).body), ['gamma holiday trip.mp4']);
  assert.deepEqual(names((await get('/api/videos?q=100%25')).body), ['Beta_100%_done.mp4']);
  assert.equal((await get('/api/videos?q=%25')).body.total, 1); // literal %, not wildcard
  assert.equal((await get('/api/videos?q=_')).body.total, 1);
}));

test('videos: filter by dir (incl. subdir), tag, untagged, missing', () => withApp(async ({ get }) => {
  assert.deepEqual((await get('/api/videos?dir=1&sort=size&order=asc')).body.items.map((v) => v.id), [2, 3, 1]);
  assert.deepEqual((await get('/api/videos?dir=2')).body.items.map((v) => v.id), [5, 4]);
  assert.equal((await get('/api/videos?dir=99')).status, 404);
  assert.deepEqual((await get('/api/videos?tag=1&order=asc')).body.items.map((v) => v.id), [1, 3]);
  assert.deepEqual((await get('/api/videos?untagged=1&order=asc')).body.items.map((v) => v.id), [2, 4, 5]);
  const miss = (await get('/api/videos?missing=1')).body;
  assert.equal(miss.total, 1);
  assert.equal(miss.items[0].id, 5);
}));

test('videos: paging', () => withApp(async ({ get }) => {
  const p1 = (await get('/api/videos?size=2&page=1')).body;
  const p3 = (await get('/api/videos?size=2&page=3')).body;
  assert.deepEqual([p1.total, p1.items.map((v) => v.id)], [5, [5, 4]]);
  assert.deepEqual(p3.items.map((v) => v.id), [1]);
  assert.equal((await get('/api/videos?size=100000')).body.size, 200); // clamped
  assert.equal((await get('/api/videos?page=abc')).body.page, 1);
}));

test('video detail: thumbCount, availability, 404', () => withApp(async ({ get }) => {
  assert.equal((await get('/api/videos/1')).body.thumbCount, 3);
  assert.equal((await get('/api/videos/2')).body.thumbCount, 10);
  const v5 = (await get('/api/videos/5')).body;
  assert.deepEqual([v5.thumbCount, v5.available], [0, false]);
  assert.equal((await get('/api/videos/1')).body.available, true);
  assert.equal((await get('/api/videos/999')).status, 404);
  assert.equal((await get('/api/videos/abc')).status, 404);
}));

test('library files absent -> 503 (Qt app never ran), server stays up', () => withApp(async ({ get }) => {
  assert.equal((await get('/api/videos')).status, 503);
  assert.equal((await get('/api/auth/status')).status, 200);
}, { library: false }));

test('the Qt DBs are never modified', () => withApp(async ({ get, fx }) => {
  const before = ['db/db.sqlite3', 'test.scexd'].map((f) => fs.readFileSync(path.join(fx.root, f)).toString('hex'));
  await get('/api/videos'); await get('/api/tags'); await get('/api/dirs'); await get('/api/videos/2');
  const after = ['db/db.sqlite3', 'test.scexd'].map((f) => fs.readFileSync(path.join(fx.root, f)).toString('hex'));
  assert.deepEqual(after, before);
}));
