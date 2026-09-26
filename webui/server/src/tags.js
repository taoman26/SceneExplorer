import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { makeWithLibrary, idParam } from './library.js';

const MAX_TAG_LEN = 64;
const MAX_TAGS_PER_VIDEO = 200;

class HttpError extends Error {
  constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; this.extra = extra; }
}

// Runs fn(doc) inside BEGIN IMMEDIATE on the Qt document DB (read-write, short transaction).
// The Qt app may have the file open, so wait for its lock (busy_timeout) instead of failing at once.
function inDocTransaction(config, fn) {
  let doc;
  try {
    doc = new DatabaseSync(config.docFile);
    doc.exec(`PRAGMA busy_timeout = ${Number(config.docBusyMs ?? 3000)}`);
    doc.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(doc);
      doc.exec('COMMIT');
      return result;
    } catch (e) {
      try { doc.exec('ROLLBACK'); } catch { /* no transaction */ }
      throw e;
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (/locked|busy/i.test(e.message)) throw new HttpError(503, 'library_busy');
    if (/readonly|read-only/i.test(e.message)) throw new HttpError(503, 'library_readonly');
    throw e;
  } finally {
    doc?.close();
  }
}

export function normalizeTagName(v) {
  if (typeof v !== 'string') return null;
  const t = v.normalize('NFC').trim();
  // eslint-disable-next-line no-control-regex
  if (!t || [...t].length > MAX_TAG_LEN || /[\u0000-\u001f\u007f]/.test(t)) return null;
  return t;
}

export function createTagsRouter(config, requireRole) {
  const router = express.Router();
  const withLibrary = makeWithLibrary(config);
  const canEdit = requireRole('user');

  router.post('/tags', canEdit, withLibrary((db, dbid, req, res) => {
    const tag = normalizeTagName(req.body?.tag);
    if (!tag) return res.status(400).json({ error: 'invalid_tag', message: `タグ名は1〜${MAX_TAG_LEN}文字で入力してください` });
    try {
      const tagid = inDocTransaction(config, (doc) => {
        const dup = doc.prepare('SELECT tagid FROM Tag WHERE tag = ? AND dbid = ?').get(tag, dbid);
        if (dup) throw new HttpError(409, 'tag_exists', { tagid: dup.tagid });
        // yomi defaults to the tag text, like the Qt tag dialog does
        return Number(doc.prepare('INSERT INTO Tag (tag, yomi, dbid) VALUES (?, ?, ?)').run(tag, tag, dbid).lastInsertRowid);
      });
      res.status(201).json({ tagid, tag, count: 0 });
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.code, ...e.extra });
      throw e;
    }
  }));

  router.delete('/tags/:id', canEdit, withLibrary((db, dbid, req, res) => {
    const tagid = idParam(req.params.id);
    try {
      inDocTransaction(config, (doc) => {
        if (!doc.prepare('SELECT 1 FROM Tag WHERE tagid = ? AND dbid = ?').get(tagid, dbid)) throw new HttpError(404, 'tag_not_found');
        doc.prepare('DELETE FROM Tagged WHERE tagid = ? AND dbid = ?').run(tagid, dbid);
        doc.prepare('DELETE FROM Tag WHERE tagid = ? AND dbid = ?').run(tagid, dbid);
      });
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.code, ...e.extra });
      throw e;
    }
  }));

  // Replace the tag set of one video (applied as a diff so concurrent edits of other rows are untouched).
  router.put('/videos/:id/tags', canEdit, withLibrary((db, dbid, req, res) => {
    const id = idParam(req.params.id);
    const list = req.body?.tagids;
    if (!Array.isArray(list) || list.length > MAX_TAGS_PER_VIDEO || !list.every((n) => Number.isInteger(n) && n > 0)) {
      return res.status(400).json({ error: 'invalid_tagids' });
    }
    if (!db.prepare('SELECT 1 FROM FileInfo WHERE id = ?').get(id)) return res.status(404).json({ error: 'video_not_found' });
    const want = [...new Set(list)];
    try {
      const result = inDocTransaction(config, (doc) => {
        const known = new Set(doc.prepare('SELECT tagid FROM Tag WHERE dbid = ?').all(dbid).map((r) => r.tagid));
        const unknown = want.filter((t) => !known.has(t));
        if (unknown.length) throw new HttpError(400, 'invalid_tagids', { unknown });
        const have = new Set(doc.prepare('SELECT tagid FROM Tagged WHERE id = ? AND dbid = ?').all(id, dbid).map((r) => r.tagid));
        const del = doc.prepare('DELETE FROM Tagged WHERE id = ? AND tagid = ? AND dbid = ?');
        const add = doc.prepare('INSERT OR REPLACE INTO Tagged (id, tagid, dbid) VALUES (?, ?, ?)');
        for (const t of have) if (!want.includes(t)) del.run(id, t, dbid);
        for (const t of want) if (!have.has(t)) add.run(id, t, dbid);
        return want;
      });
      res.json({ tagids: result });
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.code, ...e.extra });
      throw e;
    }
  }));

  return router;
}
