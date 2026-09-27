import crypto from 'node:crypto';
import express from 'express';
import { makeWithLibrary, idParam } from './library.js';

const now = () => Math.floor(Date.now() / 1000);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DEFAULT_TTL_SEC = 6 * 3600;

// Play tokens let an external player (which sends no session cookie) fetch ONE video's stream route.
// Minting requires a normal session (see users of createPlayTokenRouter); using one does not.
export function createPlayTokenStore(db) {
  const q = {
    insert: db.prepare('INSERT INTO play_tokens (token_hash, user_id, video_id, created_at, expires_at) VALUES (?,?,?,?,?)'),
    // role is read live from `users`, so a demoted/deleted user immediately loses token access too
    lookup: db.prepare(
      `SELECT t.user_id, t.video_id, u.username, u.role FROM play_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.expires_at > ?`),
    prune: db.prepare('DELETE FROM play_tokens WHERE expires_at <= ?'),
  };

  return {
    // Returns { token, expiresAt }. ttlSec bounds how long the token (and thus the downloaded playlist) stays usable.
    mint(userId, videoId, ttlSec) {
      const token = crypto.randomBytes(32).toString('base64url');
      const t = now();
      const expiresAt = t + ttlSec;
      q.prune.run(t);
      q.insert.run(sha256(token), userId, videoId, t, expiresAt);
      return { token, expiresAt };
    },
    // Returns the {id, username, role} of the token's owner if it is valid for exactly this videoId, else null.
    verify(token, videoId) {
      if (typeof token !== 'string' || !token) return null;
      const row = q.lookup.get(sha256(token), now());
      if (!row || row.video_id !== videoId) return null;
      return { id: row.user_id, username: row.username, role: row.role };
    },
  };
}

// Mints play tokens (any signed-in role, incl. viewer — same as viewing/streaming the video). Mounted after the
// normal "/api" auth gate, so this itself requires the session cookie + CSRF header, unlike the stream route.
export function createPlayTokenRouter(config, playTokens) {
  const router = express.Router();
  const withLibrary = makeWithLibrary(config);
  const ttlSec = Number(config.playTokenTtlSec) > 0 ? Number(config.playTokenTtlSec) : DEFAULT_TTL_SEC;

  router.post('/videos/:id/play-token', withLibrary((db, _dbid, req, res) => {
    const id = idParam(req.params.id);
    if (!db.prepare('SELECT 1 FROM FileInfo WHERE id = ?').get(id)) return res.status(404).json({ error: 'video_not_found' });
    const { token, expiresAt } = playTokens.mint(req.user.id, id, ttlSec);
    const url = `${req.protocol}://${req.get('host')}/api/videos/${id}/stream?token=${token}`;
    res.status(201).json({ token, url, expiresAt });
  }));

  return router;
}
