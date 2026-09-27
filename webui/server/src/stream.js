import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { makeWithLibrary, idParam } from './library.js';

const COUNT_DEDUPE_MS = 10 * 60 * 1000;

// Records one "open" in the Qt document's Access table (the same counter the Qt app shows).
// Best effort: playback must never fail because the document is locked or read-only.
export function recordOpen(config, dbid, id) {
  let doc;
  try {
    doc = new DatabaseSync(config.docFile);
    doc.exec('PRAGMA busy_timeout = 3000');
    const t = Math.floor(Date.now() / 1000);
    doc.prepare(
      `INSERT INTO Access (id, opencount, lastaccess, dbid) VALUES (?, 1, ?, ?)
       ON CONFLICT (id, dbid) DO UPDATE SET opencount = opencount + 1, lastaccess = excluded.lastaccess`,
    ).run(id, t, dbid);
  } catch (e) {
    console.error('recordOpen failed:', e.message);
  } finally {
    doc?.close();
  }
}

const attachment = (name) =>
  `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

// The video stream route, mounted BEFORE the app-wide "/api" auth gate: it authenticates itself, accepting
// either the normal session cookie (already resolved into req.user by attachUser) or a play token scoped to
// this exact video id (see playtokens.js), so an external player such as VLC — which sends no cookie — can
// fetch it. Every other route still goes through the app-wide gate and ignores play tokens entirely.
export function createStreamRouter(config, playTokens) {
  const router = express.Router();
  const withLibrary = makeWithLibrary(config);
  const recent = new Map(); // "userId:videoId" -> last counted time (a seek/probe must not count again)

  const shouldCount = (userId, role, id) => {
    if (!['user', 'admin'].includes(role)) return false;
    const key = `${userId}:${id}`;
    const t = Date.now();
    if (t - (recent.get(key) ?? 0) < COUNT_DEDUPE_MS) return false;
    recent.set(key, t);
    if (recent.size > 5000) recent.delete(recent.keys().next().value);
    return true;
  };

  router.get('/videos/:id/stream', (req, res, next) => {
    if (!req.user) {
      const id = idParam(req.params.id);
      const tokenUser = id > 0 ? playTokens.verify(req.query.token, id) : null;
      if (!tokenUser) return res.status(401).json({ error: 'unauthenticated' });
      req.user = tokenUser;
    }
    next();
  }, withLibrary((db, dbid, req, res) => {
    const id = idParam(req.params.id);
    const row = db.prepare('SELECT directory, name FROM FileInfo WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'video_not_found' });
    const file = row.directory + row.name;
    let st;
    try { st = fs.statSync(file); } catch { st = null; }
    if (!st?.isFile()) return res.status(404).json({ error: 'file_unavailable' });

    const download = req.query.download === '1';
    if (download) res.set('Content-Disposition', attachment(row.name));
    else if (shouldCount(req.user.id, req.user.role, id)) recordOpen(config, dbid, id);

    // sendFile handles Range (206 / 416), ETag and Last-Modified.
    res.sendFile(path.resolve(file), { dotfiles: 'allow', acceptRanges: true, cacheControl: false, headers: { 'Cache-Control': 'private, no-cache' } },
      (err) => { if (err && !res.headersSent) res.status(err.status || 500).json({ error: 'file_unavailable' }); });
  }));

  return router;
}
