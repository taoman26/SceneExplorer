import express from 'express';
import { hashPassword } from './password.js';
import { USERNAME_RE, MIN_PASSWORD, MAX_PASSWORD } from './auth.js';

const ROLES = ['admin', 'user', 'viewer'];
const now = () => Math.floor(Date.now() / 1000);
const pub = (u) => ({ id: u.id, username: u.username, role: u.role, created_at: u.created_at, last_login: u.last_login });

// Admin-only user management. Every change to "who is an admin" happens inside BEGIN IMMEDIATE so two
// concurrent requests can't both remove the last admin.
export function createUsersRouter(db, requireRole) {
  const router = express.Router();
  router.use('/users', requireRole('admin'));

  const q = {
    all: db.prepare('SELECT id, username, role, created_at, last_login FROM users ORDER BY id'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    byNameCI: db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)'),
    insert: db.prepare('INSERT INTO users (username, pw_hash, role, created_at) VALUES (?,?,?,?)'),
    admins: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"),
    setRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
    setPw: db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?'),
    del: db.prepare('DELETE FROM users WHERE id = ?'),
    dropSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    dropOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
  };

  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* none */ } throw e; }
  };
  const fail = (res, status, error, message) => res.status(status).json({ error, ...(message ? { message } : {}) });
  const userId = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : -1; };
  const validPassword = (p) => typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;

  router.get('/users', (_req, res) => res.json(q.all.all().map(pub)));

  router.post('/users', async (req, res) => {
    const { username, password, role } = req.body || {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) return fail(res, 400, 'invalid_username', 'ユーザー名は英数字と _ . - の1〜32文字で指定してください');
    if (!validPassword(password)) return fail(res, 400, 'invalid_password', `パスワードは${MIN_PASSWORD}文字以上で指定してください`);
    if (!ROLES.includes(role)) return fail(res, 400, 'invalid_role');
    const pwHash = await hashPassword(password);
    const out = tx(() => {
      if (q.byNameCI.get(username)) return null;
      return Number(q.insert.run(username, pwHash, role, now()).lastInsertRowid);
    });
    if (out === null) return fail(res, 409, 'user_exists', 'そのユーザー名はすでに使われています');
    res.status(201).json(pub(q.byId.get(out)));
  });

  router.patch('/users/:id', async (req, res) => {
    const id = userId(req.params.id);
    const { role, password } = req.body || {};
    if (role === undefined && password === undefined) return fail(res, 400, 'nothing_to_change');
    if (role !== undefined && !ROLES.includes(role)) return fail(res, 400, 'invalid_role');
    if (password !== undefined && !validPassword(password)) return fail(res, 400, 'invalid_password', `パスワードは${MIN_PASSWORD}文字以上で指定してください`);
    const pwHash = password !== undefined ? await hashPassword(password) : null;
    const result = tx(() => {
      const target = q.byId.get(id);
      if (!target) return 'not_found';
      if (role !== undefined && role !== target.role) {
        if (target.role === 'admin' && q.admins.get().n <= 1) return 'last_admin';
        q.setRole.run(role, id);
      }
      if (pwHash) {
        q.setPw.run(pwHash, id);
        // a changed password signs the user out everywhere (except the admin's own current session)
        if (id === req.user.id) q.dropOtherSessions.run(id, req.sessionHash); else q.dropSessions.run(id);
      }
      return 'ok';
    });
    if (result === 'not_found') return fail(res, 404, 'user_not_found');
    if (result === 'last_admin') return fail(res, 409, 'last_admin', '最後の管理者の権限は変更できません');
    res.json(pub(q.byId.get(id)));
  });

  router.delete('/users/:id', (req, res) => {
    const id = userId(req.params.id);
    if (id === req.user.id) return fail(res, 400, 'cannot_delete_self', '自分自身は削除できません');
    const result = tx(() => {
      const target = q.byId.get(id);
      if (!target) return 'not_found';
      if (target.role === 'admin' && q.admins.get().n <= 1) return 'last_admin';
      q.del.run(id); // sessions go with it (ON DELETE CASCADE)
      return 'ok';
    });
    if (result === 'not_found') return fail(res, 404, 'user_not_found');
    if (result === 'last_admin') return fail(res, 409, 'last_admin', '最後の管理者は削除できません');
    res.json({ ok: true });
  });

  return router;
}
