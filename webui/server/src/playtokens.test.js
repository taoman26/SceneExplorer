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
    const r = await fetch(`${base}/${role ? 'api/auth/login' : 'api/auth/setup'}`, { method: 'POST', headers: H,
      body: JSON.stringify({ username, password: 'password123' }) });
    return r.headers.get('set-cookie').split(';')[0];
  };
  const cookie = await login('admin');
  const mint = (id, ck = cookie) => fetch(`${base}/api/videos/${id}/play-token`, { method: 'POST', headers: { ...H, cookie: ck } })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  const access = (id) => {
    const d = new DatabaseSync(fx.config.docFile, { readOnly: true });
    try { return d.prepare('SELECT opencount FROM Access WHERE id=? AND dbid=?').get(id, DBID)?.opencount ?? 0; } finally { d.close(); }
  };
  try { await fn({ base, cookie, login, mint, access, db: app.locals.db }); } finally {
    server.close(); app.locals.db.close(); fx.cleanup(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
const bytes = async (r) => Buffer.from(await r.arrayBuffer());

test('mint requires a session + CSRF header; unknown video -> 404', () => withApp(async ({ base, mint, cookie }) => {
  assert.equal((await fetch(`${base}/api/videos/1/play-token`, { method: 'POST', headers: H })).status, 401); // no cookie
  assert.equal((await fetch(`${base}/api/videos/1/play-token`, { method: 'POST', headers: { cookie } })).status, 403); // no CSRF header
  const r = await mint(1);
  assert.equal(r.status, 201);
  assert.match(r.body.token, /^[A-Za-z0-9_-]{20,}$/);
  assert.match(r.body.url, new RegExp(`/api/videos/1/stream\\?token=${r.body.token}$`));
  assert.ok(r.body.expiresAt > Math.floor(Date.now() / 1000));
  assert.equal((await mint(999)).status, 404);
}));

test('viewer role can mint and use a token (read-only playback is allowed)', () => withApp(async ({ base, login, mint }) => {
  const viewerCk = await login('v1', 'viewer');
  const r = await mint(1, viewerCk);
  assert.equal(r.status, 201);
  const play = await fetch(r.body.url);
  assert.equal(play.status, 200);
}));

test('token works with no cookie at all, like an external player (VLC)', () => withApp(async ({ mint }) => {
  const { body } = await mint(1);
  const r = await fetch(body.url); // deliberately no cookie header
  assert.equal(r.status, 200);
  assert.deepEqual(await bytes(r), VIDEO_BYTES);
  assert.equal(r.headers.get('accept-ranges'), 'bytes');
}));

test('token supports Range requests, like a real player seeking', () => withApp(async ({ mint }) => {
  const { body } = await mint(1);
  const r = await fetch(body.url.replace('/stream', '/stream'), { headers: { Range: 'bytes=10-19' } });
  assert.equal(r.status, 206);
  assert.deepEqual(await bytes(r), VIDEO_BYTES.subarray(10, 20));
}));

test('token is scoped to exactly the video it was minted for', () => withApp(async ({ base, mint }) => {
  const { body } = await mint(1);
  const wrongId = body.url.replace('/videos/1/stream', '/videos/4/stream');
  assert.equal((await fetch(wrongId)).status, 401);
  assert.equal((await fetch(`${base}/api/videos/4/stream?token=${body.token}`)).status, 401);
}));

test('token grants ONLY the stream route: thumbnails and the rest of the API still need a session', () => withApp(async ({ base, mint }) => {
  const { body } = await mint(1);
  assert.equal((await fetch(`${base}/api/videos/1/thumb/1?token=${body.token}`)).status, 401);
  assert.equal((await fetch(`${base}/api/videos?token=${body.token}`)).status, 401);
  assert.equal((await fetch(`${base}/api/users?token=${body.token}`)).status, 401);
}));

test('invalid, unknown or garbage tokens are rejected; missing token behaves like no auth at all', () => withApp(async ({ base }) => {
  assert.equal((await fetch(`${base}/api/videos/1/stream`)).status, 401);
  assert.equal((await fetch(`${base}/api/videos/1/stream?token=`)).status, 401);
  assert.equal((await fetch(`${base}/api/videos/1/stream?token=not-a-real-token`)).status, 401);
  assert.equal((await fetch(`${base}/api/videos/abc/stream?token=x`)).status, 401);
}));

test('expired token is rejected', () => withApp(async ({ mint, db }) => {
  const { body } = await mint(1);
  db.exec(`UPDATE play_tokens SET expires_at = 1`);
  assert.equal((await fetch(body.url)).status, 401);
}));

test('a token still works even after its minting session is logged out (it is independent of the session)', () => withApp(async ({ base, mint, cookie }) => {
  const { body } = await mint(1);
  await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { ...H, cookie } });
  assert.equal((await fetch(body.url)).status, 200);
}));

test('demoting/deleting the minting user is reflected live: role change removes the play-count bonus, deletion revokes the token', () => withApp(async ({ mint, access, db }) => {
  const { body: tokenBody } = await mint(4); // fixture video 4 has no existing Access row
  const uid = db.prepare("SELECT id FROM users WHERE username='admin'").get().id;
  db.prepare("UPDATE users SET role='viewer' WHERE id=?").run(uid);
  await fetch(tokenBody.url);
  assert.equal(access(4), 0, 'demoted to viewer: playing over the token must not count');
  db.prepare('DELETE FROM users WHERE id=?').run(uid);
  assert.equal((await fetch(tokenBody.url)).status, 401); // token's owner no longer exists
}));

test('SE_PLAY_TOKEN_TTL_SEC controls the expiry', () => withApp(async ({ mint, db }) => {
  const t0 = Math.floor(Date.now() / 1000);
  const { body } = await mint(1);
  assert.ok(body.expiresAt <= t0 + 5 + 5, 'default ~6h would be much larger than a 5s ttl');
  const row = db.prepare('SELECT expires_at FROM play_tokens').get();
  assert.equal(row.expires_at, body.expiresAt);
}, { playTokenTtlSec: 5 }));

test('download=1 still works over a token URL (attachment header, no cookie needed)', () => withApp(async ({ mint }) => {
  const { body } = await mint(2);
  const r = await fetch(`${body.url}&download=1`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /^attachment;/);
}));
