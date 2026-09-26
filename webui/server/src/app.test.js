import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { createLoginLimiter } from './ratelimit.js';

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'SceneExplorer' };

async function withServer(fn, opts) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-test-'));
  const app = createApp({ dataDir }, opts);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, headers = H) =>
    fetch(base + p, { method: 'POST', headers, body: JSON.stringify(body) });
  try { await fn({ base, post, db: app.locals.db }); } finally {
    server.close(); app.locals.db.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];

test('health is public', () => withServer(async ({ base }) => {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true });
}));

test('non-auth api routes need a session (even unknown ones)', () => withServer(async ({ base }) => {
  assert.equal((await fetch(`${base}/api/videos`)).status, 401);
  assert.equal((await fetch(`${base}/api/nope`)).status, 401);
}));

test('setup -> status -> logout -> login flow', () => withServer(async ({ base, post }) => {
  let s = await (await fetch(`${base}/api/auth/status`)).json();
  assert.deepEqual(s, { needsSetup: true, user: null });

  const r = await post('/api/auth/setup', { username: 'admin', password: 'password123' });
  assert.equal(r.status, 201);
  const setCookie = r.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = cookieOf(r);

  s = await (await fetch(`${base}/api/auth/status`, { headers: { cookie } })).json();
  assert.equal(s.needsSetup, false);
  assert.equal(s.user.username, 'admin');
  assert.equal(s.user.role, 'admin');
  assert.equal((await fetch(`${base}/api/nope`, { headers: { cookie } })).status, 404);

  assert.equal((await post('/api/auth/setup', { username: 'x2', password: 'password123' })).status, 409);

  await post('/api/auth/logout', {}, { ...H, cookie });
  s = await (await fetch(`${base}/api/auth/status`, { headers: { cookie } })).json();
  assert.equal(s.user, null);

  assert.equal((await post('/api/auth/login', { username: 'admin', password: 'wrong-pass' })).status, 401);
  const ok = await post('/api/auth/login', { username: 'admin', password: 'password123' });
  assert.equal(ok.status, 200);
  assert.ok(cookieOf(ok).startsWith('se_session='));
}));

test('setup validates input; password is stored hashed', () => withServer(async ({ post, db }) => {
  assert.equal((await post('/api/auth/setup', { username: 'admin', password: 'short' })).status, 400);
  assert.equal((await post('/api/auth/setup', { username: 'a b', password: 'password123' })).status, 400);
  await post('/api/auth/setup', { username: 'admin', password: 'password123' });
  const row = db.prepare('SELECT pw_hash FROM users').get();
  assert.ok(!row.pw_hash.includes('password123'));
  assert.match(row.pw_hash, /^16384\$/);
  // session token is stored hashed, never raw
  assert.equal(db.prepare('SELECT token_hash FROM sessions').get().token_hash.length, 64);
}));

test('concurrent setup creates exactly one admin', () => withServer(async ({ post, db }) => {
  const rs = await Promise.all([1, 2, 3, 4].map((i) =>
    post('/api/auth/setup', { username: `admin${i}`, password: 'password123' })));
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409, 409]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
}));

test('csrf: state-changing request without header is rejected', () => withServer(async ({ post }) => {
  const r = await post('/api/auth/setup', { username: 'admin', password: 'password123' },
    { 'Content-Type': 'application/json' });
  assert.equal(r.status, 403);
}));

test('login rate limit: 5 failures then 429, correct password also blocked', () => {
  const limiter = createLoginLimiter();
  return withServer(async ({ post }) => {
    await post('/api/auth/setup', { username: 'admin', password: 'password123' });
    for (let i = 0; i < 5; i++) {
      assert.equal((await post('/api/auth/login', { username: 'admin', password: 'bad-password' })).status, 401);
    }
    const r = await post('/api/auth/login', { username: 'admin', password: 'password123' });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
  }, { limiter });
});

test('expired session is rejected', () => withServer(async ({ base, post, db }) => {
  const r = await post('/api/auth/setup', { username: 'admin', password: 'password123' });
  const cookie = cookieOf(r);
  db.exec('UPDATE sessions SET expires_at = 1');
  assert.equal((await fetch(`${base}/api/nope`, { headers: { cookie } })).status, 401);
}));

test('malformed json gives 400', () => withServer(async ({ base }) => {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: H, body: '{bad' });
  assert.equal(r.status, 400);
}));
