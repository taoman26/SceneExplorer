import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { makeThumbFinder } from './thumbs.js';

const SORTS = {
  wtime: 'f.wtime', name: 'f.name COLLATE NOCASE', size: 'f.size', duration: 'f.duration',
  opencount: 'COALESCE(a.opencount,0)', lastaccess: 'COALESCE(a.lastaccess,0)',
};
const PAGE_DEFAULT = 48;
const PAGE_MAX = 200;

export class LibraryUnavailable extends Error {}

// Opens the Qt library DB with the Qt document DB attached as `doc`, both read-only.
// Opened per request so it follows whatever the Qt app currently has on disk.
export function openLibrary(config) {
  const libFile = path.join(config.dbDir, 'db.sqlite3');
  if (!fs.existsSync(libFile) || !fs.existsSync(config.docFile)) throw new LibraryUnavailable();
  const db = new DatabaseSync(libFile, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    db.prepare('ATTACH DATABASE ? AS doc').run(`file:${config.docFile}?mode=ro`);
    const info = db.prepare('SELECT dbid FROM DbInfo WHERE id = 1').get();
    if (!info) throw new LibraryUnavailable();
    return { db, dbid: info.dbid };
  } catch (e) {
    db.close();
    throw e instanceof LibraryUnavailable ? e : new LibraryUnavailable(e.message);
  }
}

const escLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
const intParam = (v, def, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

function toVideo(r) {
  return {
    id: r.id, directory: r.directory, name: r.name, path: r.directory + r.name,
    size: r.size, wtime: r.wtime, duration: r.duration, format: r.format, bitrate: r.bitrate,
    vcodec: r.vcodec, acodec: r.acodec, width: r.vwidth, height: r.vheight, fps: r.fps,
    opencount: r.opencount ?? 0, lastaccess: r.lastaccess ?? null,
  };
}

const SELECT = `SELECT f.id, f.directory, f.name, f.size, f.wtime, f.duration, f.format, f.bitrate,
    f.vcodec, f.acodec, f.vwidth, f.vheight, f.fps, a.opencount, a.lastaccess
  FROM FileInfo f LEFT JOIN doc.Access a ON a.id = f.id AND a.dbid = ?`;

function attachTagIds(db, dbid, videos) {
  if (!videos.length) return videos;
  const byId = new Map(videos.map((v) => [v.id, (v.tagids = [])]));
  const rows = db.prepare(
    `SELECT id, tagid FROM doc.Tagged WHERE dbid = ? AND id IN (${videos.map(() => '?').join(',')})`,
  ).all(dbid, ...byId.keys());
  for (const r of rows) byId.get(r.id).push(r.tagid);
  return videos;
}

// Wraps a handler so a missing/broken Qt DB becomes 503 and the connection is always closed.
export const makeWithLibrary = (config) => (fn) => (req, res, next) => {
  let lib;
  try {
    lib = openLibrary(config);
    fn(lib.db, lib.dbid, req, res);
  } catch (e) {
    if (e instanceof LibraryUnavailable) return res.status(503).json({ error: 'library_unavailable' });
    next(e);
  } finally {
    lib?.db.close();
  }
};

export const idParam = (v) => intParam(v, -1, -1, 2 ** 40);

export function createLibraryRouter(config) {
  const router = express.Router();
  const withLibrary = makeWithLibrary(config);
  const findThumb = makeThumbFinder(config);

  router.get('/dirs', withLibrary((db, _dbid, _req, res) => {
    const dirs = db.prepare('SELECT id, directory, displaytext FROM doc.Directories ORDER BY id').all();
    const count = db.prepare(
      'SELECT COUNT(*) AS n FROM FileInfo WHERE substr(directory, 1, length(?)) = ?');
    res.json(dirs.map((d) => ({
      id: d.id, directory: d.directory, displaytext: d.displaytext || '',
      count: count.get(d.directory, d.directory).n,
    })));
  }));

  router.get('/tags', withLibrary((db, dbid, _req, res) => {
    const tags = db.prepare(
      `SELECT t.tagid, t.tag, (SELECT COUNT(*) FROM doc.Tagged g WHERE g.tagid = t.tagid AND g.dbid = t.dbid) AS count
       FROM doc.Tag t WHERE t.dbid = ? ORDER BY COALESCE(NULLIF(t.yomi,''), t.tag) COLLATE NOCASE`).all(dbid);
    const untagged = db.prepare(
      `SELECT COUNT(*) AS n FROM FileInfo f
       WHERE NOT EXISTS (SELECT 1 FROM doc.Tagged g WHERE g.id = f.id AND g.dbid = ?)`).get(dbid).n;
    res.json({ tags, untagged });
  }));

  router.get('/videos', withLibrary((db, dbid, req, res) => {
    const { dir, tag, untagged, missing, q } = req.query;
    const sortKey = Object.hasOwn(SORTS, req.query.sort) ? req.query.sort : 'wtime';
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
    const size = intParam(req.query.size, PAGE_DEFAULT, 1, PAGE_MAX);
    const page = intParam(req.query.page, 1, 1, 1e6);

    const where = [];
    const params = [];
    if (dir !== undefined) {
      const d = db.prepare('SELECT directory FROM doc.Directories WHERE id = ?').get(intParam(dir, -1, -1, 1e9));
      if (!d) return res.status(404).json({ error: 'dir_not_found' });
      where.push('substr(f.directory, 1, length(?)) = ?');
      params.push(d.directory, d.directory);
    }
    if (untagged === '1') {
      where.push('NOT EXISTS (SELECT 1 FROM doc.Tagged g WHERE g.id = f.id AND g.dbid = ?)');
      params.push(dbid);
    } else if (tag !== undefined) {
      where.push('EXISTS (SELECT 1 FROM doc.Tagged g WHERE g.id = f.id AND g.tagid = ? AND g.dbid = ?)');
      params.push(intParam(tag, -1, -1, 1e9), dbid);
    }
    for (const term of String(q || '').split(/\s+/).filter(Boolean)) {
      where.push("f.name LIKE ? ESCAPE '\\'");
      params.push(`%${escLike(term)}%`);
    }
    const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const orderSql = ` ORDER BY ${SORTS[sortKey]} ${order}, f.id ${order}`;

    let total;
    let rows;
    if (missing === '1') {
      // "Missing" = original file no longer exists; needs the filesystem, so filter in JS.
      const all = db.prepare(SELECT + whereSql + orderSql).all(dbid, ...params)
        .filter((r) => !fs.existsSync(r.directory + r.name));
      total = all.length;
      rows = all.slice((page - 1) * size, page * size);
    } else {
      total = db.prepare(`SELECT COUNT(*) AS n FROM FileInfo f${whereSql}`).get(...params).n;
      rows = db.prepare(SELECT + whereSql + orderSql + ' LIMIT ? OFFSET ?')
        .all(dbid, ...params, size, (page - 1) * size);
    }
    res.json({ total, page, size, items: attachTagIds(db, dbid, rows.map(toVideo)) });
  }));

  router.get('/videos/:id', withLibrary((db, dbid, req, res) => {
    const row = db.prepare(SELECT + ' WHERE f.id = ?').get(dbid, intParam(req.params.id, -1, -1, 2 ** 40));
    if (!row) return res.status(404).json({ error: 'video_not_found' });
    const full = db.prepare('SELECT thumbid, thumbext FROM FileInfo WHERE id = ?').get(row.id);
    const video = attachTagIds(db, dbid, [toVideo(row)])[0];
    let thumbCount = 0;
    while (thumbCount < 100 && findThumb(full, thumbCount + 1)) thumbCount++;
    video.thumbCount = thumbCount;
    video.available = fs.existsSync(video.path);
    res.json(video);
  }));

  return router;
}
