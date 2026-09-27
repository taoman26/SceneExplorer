import express from 'express';
import { makeWithLibrary, idParam } from './library.js';
import { makeThumbFinder } from './thumbs.js';

// Thumbnails only; always requires the normal session (mounted after the global auth gate in app.js).
// The video stream route lives in stream.js — it also accepts a play token, so it is mounted separately,
// before that gate, and authenticates itself.
export function createMediaRouter(config) {
  const router = express.Router();
  const withLibrary = makeWithLibrary(config);
  const findThumb = makeThumbFinder(config);

  router.get('/videos/:id/thumb/:n', withLibrary((db, _dbid, req, res) => {
    const n = Number(req.params.n);
    const row = db.prepare('SELECT thumbid, thumbext FROM FileInfo WHERE id = ?').get(idParam(req.params.id));
    if (!row || !Number.isInteger(n) || n < 1 || n > 100) return res.status(404).json({ error: 'thumb_not_found' });
    const file = findThumb(row, n);
    if (!file) return res.status(404).json({ error: 'thumb_not_found' });
    // sendFile answers 404 itself if the file is missing.
    res.sendFile(file, { dotfiles: 'allow', maxAge: '1h', cacheControl: true, headers: { 'Cache-Control': 'private, max-age=3600' } },
      (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'thumb_not_found' }); });
  }));

  return router;
}
