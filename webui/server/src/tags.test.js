import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app.js';
import { makeFixture, DBID } from './fixtures.js';
import { hashPassword } from './password.js';

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'SceneExplorer' };

async function withApp(fn, extra = {}) {
  const fx = makeFixture();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-test-'));
  const app = createApp({ ...fx.config, dataDir, ...extra });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (username, role) => {
    if (role) app.locals.db.prepare('INSERT INTO users (username, pw_hash, role, created_at) VALUES (?,?,?,0)')
      .run(username, await hashPassword('password123'), role);
    const r = await fetch(`${base}/api/${role ? 'auth/login' : 'auth/setup'}`, { method: 'POST', headers: H,
      body: JSON.stringify({ username, password: 'password123' }) });
    return r.headers.get('set-cookie').split(';')[0];
  };
  const cookie = await login('admin');
  const call = (method, p, body, ck = cookie) => fetch(base + p, { method, headers: { ...H, cookie: ck }, body: body === undefined ? undefined : JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  const q = (sql, ...a) => { const d = new DatabaseSync(fx.config.docFile, { readOnly: true }); try { return d.prepare(sql).all(...a); } finally { d.close(); } };
  const q2 = (sql, ...a) => JSON.parse(JSON.stringify(q(sql, ...a))); // plain objects (node:sqlite rows have a null prototype)
  try { await fn({ call, q: q2, login, fx, base }); } finally {
    server.close(); app.locals.db.close(); fx.cleanup(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
const tagsOf = (q, id) => q('SELECT tagid FROM Tagged WHERE id=? AND dbid=? ORDER BY tagid', id, DBID).map((r) => r.tagid);

test('PUT video tags: adds and removes as a diff; other videos untouched', () => withApp(async ({ call, q }) => {
  // fixture: v1 -> [1], v3 -> [1,2]
  let r = await call('PUT', '/api/videos/1/tags', { tagids: [2] });
  assert.deepEqual([r.status, r.body], [200, { tagids: [2] }]);
  assert.deepEqual(tagsOf(q, 1), [2]);
  assert.deepEqual(tagsOf(q, 3), [1, 2]);
  r = await call('PUT', '/api/videos/1/tags', { tagids: [1, 2, 2] }); // duplicates collapse
  assert.deepEqual(tagsOf(q, 1), [1, 2]);
  r = await call('PUT', '/api/videos/1/tags', { tagids: [] });
  assert.deepEqual(tagsOf(q, 1), []);
  // visible through the read API
  await call('PUT', '/api/videos/4/tags', { tagids: [1] });
  assert.deepEqual((await call('GET', '/api/videos/4')).body.tagids, [1]);
}));

test('PUT video tags: validation (unknown tag, other library tag, bad body, unknown video)', () => withApp(async ({ call, q }) => {
  let r = await call('PUT', '/api/videos/1/tags', { tagids: [999] });
  assert.deepEqual([r.status, r.body.error, r.body.unknown], [400, 'invalid_tagids', [999]]);
  r = await call('PUT', '/api/videos/1/tags', { tagids: [3] }); // tag 3 belongs to another dbid
  assert.equal(r.status, 400);
  for (const bad of [{}, { tagids: 'x' }, { tagids: [1.5] }, { tagids: [0] }, { tagids: ['1'] }]) {
    assert.equal((await call('PUT', '/api/videos/1/tags', bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call('PUT', '/api/videos/999/tags', { tagids: [1] })).status, 404);
  assert.deepEqual(tagsOf(q, 1), [1]); // nothing changed by the failed calls
}));

test('POST /tags: create (yomi = tag), trim/NFC, duplicates 409, same name in another library ok, invalid names 400', () => withApp(async ({ call, q }) => {
  let r = await call('POST', '/api/tags', { tag: '  新しい タグ ' });
  assert.equal(r.status, 201);
  assert.equal(r.body.tag, '新しい タグ');
  assert.deepEqual(q('SELECT tag, yomi, dbid FROM Tag WHERE tagid=?', r.body.tagid), [{ tag: '新しい タグ', yomi: '新しい タグ', dbid: DBID }]);
  r = await call('POST', '/api/tags', { tag: 'travel' });
  assert.deepEqual([r.status, r.body.error, r.body.tagid], [409, 'tag_exists', 1]);
  assert.equal((await call('POST', '/api/tags', { tag: 'other-lib' })).status, 201); // exists only in another dbid
  for (const bad of ['', '   ', 'x'.repeat(65), 'a\nb', 5, null]) {
    assert.equal((await call('POST', '/api/tags', { tag: bad })).status, 400, JSON.stringify(bad));
  }
  const listed = (await call('GET', '/api/tags')).body;
  assert.ok(listed.tags.some((t) => t.tag === '新しい タグ' && t.count === 0));
}));

test('DELETE /tags/:id removes the tag and its Tagged rows, only for this library', () => withApp(async ({ call, q }) => {
  assert.equal((await call('DELETE', '/api/tags/1')).status, 200);
  assert.deepEqual(q('SELECT tagid FROM Tag ORDER BY tagid').map((r) => r.tagid), [2, 3]);
  assert.deepEqual(q('SELECT id, tagid FROM Tagged ORDER BY id, tagid'), [{ id: 3, tagid: 2 }]);
  assert.equal((await call('DELETE', '/api/tags/1')).status, 404);
  assert.equal((await call('DELETE', '/api/tags/3')).status, 404); // other dbid's tag can't be deleted
  assert.equal(q('SELECT COUNT(*) n FROM Tag WHERE tagid=3')[0].n, 1);
}));

test('roles: viewer cannot edit (403) and nothing changes; user can; unauthenticated 401/403', () => withApp(async ({ call, q, login, base }) => {
  const viewer = await login('vv', 'viewer');
  for (const [m, p, b] of [['PUT', '/api/videos/1/tags', { tagids: [] }], ['POST', '/api/tags', { tag: 'zz' }], ['DELETE', '/api/tags/1']]) {
    assert.equal((await call(m, p, b, viewer)).status, 403, `${m} ${p}`);
  }
  assert.deepEqual(tagsOf(q, 1), [1]);
  const user = await login('uu', 'user');
  assert.equal((await call('PUT', '/api/videos/1/tags', { tagids: [2] }, user)).status, 200);
  const r = await fetch(`${base}/api/tags`, { method: 'POST', headers: H, body: '{"tag":"x"}' });
  assert.equal(r.status, 401);
}));

// Holds the Qt document's write lock from a separate process (like the real Qt app), releasing after `ms`.
function holdLockInOtherProcess(file, ms) {
  const code = `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);d.exec('BEGIN IMMEDIATE');console.log('locked');setTimeout(()=>{d.exec('COMMIT');d.close();},${ms});`;
  const child = spawn(process.execPath, ['--no-warnings', '-e', code, file], { stdio: ['ignore', 'pipe', 'inherit'] });
  const ready = new Promise((r) => child.stdout.once('data', r));
  const done = new Promise((r) => child.once('exit', r));
  return { ready, done };
}

test('waits for a lock held by another process (Qt app), then succeeds', () => withApp(async ({ call, q, fx }) => {
  const lock = holdLockInOtherProcess(fx.config.docFile, 400);
  await lock.ready;
  const t0 = Date.now();
  const r = await call('PUT', '/api/videos/4/tags', { tagids: [2] });
  await lock.done;
  assert.equal(r.status, 200);
  assert.ok(Date.now() - t0 >= 300, 'should have waited for the lock');
  assert.deepEqual(tagsOf(q, 4), [2]);
}));

test('lock held too long -> 503 library_busy, nothing written', () => withApp(async ({ call, q, fx }) => {
  const lock = holdLockInOtherProcess(fx.config.docFile, 1500);
  await lock.ready;
  const r = await call('PUT', '/api/videos/4/tags', { tagids: [2] });
  await lock.done;
  assert.deepEqual([r.status, r.body.error], [503, 'library_busy']);
  assert.deepEqual(tagsOf(q, 4), []);
}, { docBusyMs: 150 }));

test('read-only document -> 503 library_readonly', () => withApp(async ({ call, fx }) => {
  fs.chmodSync(fx.config.docFile, 0o444);
  const r = await call('PUT', '/api/videos/4/tags', { tagids: [1] });
  assert.deepEqual([r.status, r.body.error], [503, 'library_readonly']);
}));
