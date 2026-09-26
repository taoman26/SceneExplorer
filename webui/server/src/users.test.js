import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { hashPassword } from './password.js';

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'SceneExplorer' };

async function withApp(fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-test-'));
  const app = createApp({ dataDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const db = app.locals.db;
  const signIn = async (username, password = 'password123') => {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: H, body: JSON.stringify({ username, password }) });
    return r.status === 200 ? r.headers.get('set-cookie').split(';')[0] : null;
  };
  const addUser = async (username, role) => db.prepare('INSERT INTO users (username, pw_hash, role, created_at) VALUES (?,?,?,0)')
    .run(username, await hashPassword('password123'), role);
  await addUser('admin', 'admin');
  const cookie = await signIn('admin');
  const call = (method, p, body, ck = cookie) => fetch(base + p, { method, headers: { ...H, ...(ck ? { cookie: ck } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  const status = async (ck) => (await (await fetch(`${base}/api/auth/status`, { headers: { cookie: ck } })).json()).user;
  try { await fn({ call, signIn, addUser, db, cookie, status }); } finally {
    server.close(); db.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('non-admins and anonymous callers cannot manage users', () => withApp(async ({ call, addUser, signIn }) => {
  await addUser('u1', 'user'); await addUser('v1', 'viewer');
  for (const who of ['u1', 'v1']) {
    const ck = await signIn(who);
    assert.equal((await call('GET', '/api/users', undefined, ck)).status, 403, who);
    assert.equal((await call('POST', '/api/users', { username: 'x1', password: 'password123', role: 'user' }, ck)).status, 403, who);
    assert.equal((await call('PATCH', '/api/users/1', { role: 'user' }, ck)).status, 403, who);
    assert.equal((await call('DELETE', '/api/users/1', undefined, ck)).status, 403, who);
  }
  assert.equal((await call('GET', '/api/users', undefined, null)).status, 401);
}));

test('list never exposes password hashes', () => withApp(async ({ call }) => {
  const r = await call('GET', '/api/users');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body[0]).sort(), ['created_at', 'id', 'last_login', 'role', 'username']);
  const c = await call('POST', '/api/users', { username: 'bob', password: 'password123', role: 'user' });
  assert.ok(!('pw_hash' in c.body));
}));

test('create: works, can log in, duplicate (case-insensitive) 409, validation 400', () => withApp(async ({ call, signIn }) => {
  const r = await call('POST', '/api/users', { username: 'Alice', password: 'password123', role: 'viewer' });
  assert.deepEqual([r.status, r.body.username, r.body.role], [201, 'Alice', 'viewer']);
  assert.ok(await signIn('Alice'));
  assert.equal((await call('POST', '/api/users', { username: 'alice', password: 'password123', role: 'user' })).status, 409);
  for (const bad of [{ username: 'a b', password: 'password123', role: 'user' }, { username: 'ok1', password: 'short', role: 'user' },
    { username: 'ok2', password: 'password123', role: 'root' }, { username: 'ok3', password: 'password123' }, {}]) {
    assert.equal((await call('POST', '/api/users', bad)).status, 400, JSON.stringify(bad));
  }
}));

test('password change: old fails / new works; other sessions of that user are signed out', () => withApp(async ({ call, signIn, addUser, status }) => {
  await addUser('bob', 'user');
  const s1 = await signIn('bob'); const s2 = await signIn('bob');
  assert.ok(await status(s1));
  const id = (await call('GET', '/api/users')).body.find((u) => u.username === 'bob').id;
  assert.equal((await call('PATCH', `/api/users/${id}`, { password: 'newpassword9' })).status, 200);
  assert.equal(await signIn('bob'), null);
  assert.ok(await signIn('bob', 'newpassword9'));
  assert.equal(await status(s1), null);
  assert.equal(await status(s2), null);
  assert.equal((await call('PATCH', `/api/users/${id}`, { password: 'short' })).status, 400);
}));

test("admin changing own password keeps the current session but drops the others", () => withApp(async ({ call, signIn, cookie, status }) => {
  const other = await signIn('admin');
  const id = (await call('GET', '/api/users')).body[0].id;
  assert.equal((await call('PATCH', `/api/users/${id}`, { password: 'brandnewpass1' })).status, 200);
  assert.ok(await status(cookie));
  assert.equal(await status(other), null);
}));

test('role change takes effect immediately; last admin cannot be demoted', () => withApp(async ({ call, signIn, addUser }) => {
  await addUser('bob', 'user');
  const users = (await call('GET', '/api/users')).body;
  const bob = users.find((u) => u.username === 'bob').id, admin = users.find((u) => u.username === 'admin').id;
  const bobCk = await signIn('bob');
  assert.equal((await call('GET', '/api/users', undefined, bobCk)).status, 403);
  assert.equal((await call('PATCH', `/api/users/${bob}`, { role: 'admin' })).status, 200);
  assert.equal((await call('GET', '/api/users', undefined, bobCk)).status, 200); // no re-login needed
  assert.equal((await call('PATCH', `/api/users/${admin}`, { role: 'viewer' })).status, 200); // 2 admins: allowed
  const r = await call('PATCH', `/api/users/${bob}`, { role: 'user' }, bobCk); // bob is now the last admin
  assert.deepEqual([r.status, r.body.error], [409, 'last_admin']);
  assert.equal((await call('PATCH', '/api/users/999', { role: 'user' }, bobCk)).status, 404);
  assert.equal((await call('PATCH', `/api/users/${bob}`, { role: 'nope' }, bobCk)).status, 400);
  assert.equal((await call('PATCH', `/api/users/${bob}`, {}, bobCk)).status, 400);
}));

test('delete: sessions die with the user; not self; not the last admin; 404', () => withApp(async ({ call, signIn, addUser, status, db }) => {
  await addUser('bob', 'user');
  const bobCk = await signIn('bob');
  const users = (await call('GET', '/api/users')).body;
  const bob = users.find((u) => u.username === 'bob').id, admin = users.find((u) => u.username === 'admin').id;
  assert.equal((await call('DELETE', `/api/users/${admin}`)).body.error, 'cannot_delete_self');
  assert.equal((await call('DELETE', `/api/users/${bob}`)).status, 200);
  assert.equal(await status(bobCk), null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ?').get(bob).n, 0);
  assert.equal((await call('DELETE', `/api/users/${bob}`)).status, 404);
  // another admin tries to delete the only admin
  await addUser('mgr', 'admin');
  const mgrCk = await signIn('mgr');
  assert.equal((await call('DELETE', `/api/users/${admin}`, undefined, mgrCk)).status, 200); // two admins: ok
  await addUser('u2', 'user');
  const u2 = db.prepare("SELECT id FROM users WHERE username='u2'").get().id;
  await call('PATCH', `/api/users/${u2}`, { role: 'admin' }, mgrCk);
  await call('PATCH', `/api/users/${u2}`, { role: 'user' }, mgrCk);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n, 1);
}));

test('concurrent demotions of two admins leave at least one admin', () => withApp(async ({ call, signIn, addUser, db }) => {
  await addUser('mgr', 'admin');
  const mgrCk = await signIn('mgr');
  const users = (await call('GET', '/api/users')).body;
  const ids = users.map((u) => u.id);
  const rs = await Promise.all([
    call('PATCH', `/api/users/${ids[0]}`, { role: 'viewer' }, mgrCk),
    call('PATCH', `/api/users/${ids[1]}`, { role: 'viewer' }),
  ]);
  // the loser is refused either by the last-admin rule (409) or because it was already demoted (403)
  assert.ok(rs.filter((r) => r.status === 200).length <= 1, JSON.stringify(rs.map((r) => r.status)));
  assert.ok(db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n >= 1);
}));
