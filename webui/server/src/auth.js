import crypto from 'node:crypto';
import express from 'express';
import { hashPassword, verifyPassword, DUMMY_HASH } from './password.js';
import { createLoginLimiter } from './ratelimit.js';

export const COOKIE = 'se_session';
const SESSION_SECONDS = 7 * 24 * 3600;
export const USERNAME_RE = /^[A-Za-z0-9_.-]{1,32}$/;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
const now = () => Math.floor(Date.now() / 1000);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(req, token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` + (req.secure ? '; Secure' : '');
}

function validateCredentials(body) {
  const { username, password } = body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return 'ユーザー名は英数字と _ . - の1〜32文字で指定してください';
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return `パスワードは${MIN_PASSWORD}文字以上で指定してください`;
  }
  return null;
}

// Requires this header on state-changing requests (on top of SameSite=Strict and JSON-only bodies).
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'SceneExplorer') return res.status(403).json({ error: 'csrf' });
  next();
}

export function createAuth(db, { limiter = createLoginLimiter() } = {}) {
  const q = {
    userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    insertUser: db.prepare('INSERT INTO users (username, pw_hash, role, created_at) VALUES (?,?,?,?)'),
    touchLogin: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)'),
    sessionUser: db.prepare(
      `SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    pruneSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    q.pruneSessions.run(t);
    q.insertSession.run(sha256(token), userId, t, t + SESSION_SECONDS);
    q.touchLogin.run(t, userId);
    res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_SECONDS));
  }

  // Sets req.user (or null) from the session cookie.
  function attachUser(req, _res, next) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    req.sessionHash = token ? sha256(token) : null;
    req.user = token ? q.sessionUser.get(req.sessionHash, now()) || null : null;
    next();
  }

  function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    next();
  }

  const roleRank = { viewer: 0, user: 1, admin: 2 };
  const requireRole = (min) => (req, res, next) =>
    roleRank[req.user?.role] >= roleRank[min] ? next() : res.status(403).json({ error: 'forbidden' });

  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json({ needsSetup: q.userCount.get().n === 0, user: req.user });
  });

  router.post('/setup', async (req, res) => {
    const err = validateCredentials(req.body);
    if (err) return res.status(400).json({ error: 'invalid', message: err });
    const pwHash = await hashPassword(req.body.password);
    let id;
    try {
      // IMMEDIATE: two concurrent setups can't both see "no users".
      db.exec('BEGIN IMMEDIATE');
      if (q.userCount.get().n !== 0) {
        db.exec('ROLLBACK');
        return res.status(409).json({ error: 'already_setup' });
      }
      id = Number(q.insertUser.run(req.body.username, pwHash, 'admin', now()).lastInsertRowid);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* not in a transaction */ }
      throw e;
    }
    startSession(req, res, id);
    res.status(201).json({ user: { id, username: req.body.username, role: 'admin' } });
  });

  router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'invalid' });
    }
    const key = `${req.ip}|${username.toLowerCase()}`;
    const wait = limiter.retryAfter(key);
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: 'too_many_attempts', retryAfter: wait });
    }
    const user = q.userByName.get(username);
    const ok = await verifyPassword(password, user ? user.pw_hash : DUMMY_HASH);
    if (!user || !ok) {
      limiter.fail(key);
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    limiter.reset(key);
    startSession(req, res, user.id);
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  });

  router.post('/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) q.deleteSession.run(sha256(token));
    res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
    res.json({ ok: true });
  });

  return { router, attachUser, requireAuth, requireRole };
}
