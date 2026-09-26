import fs from 'node:fs';
import path from 'node:path';

// Qt names thumbnails  <thumbid>-<N>.<ext>            when they have its default size (240x180), and
//                      <thumbid>-<W>x<H>-<N>.<ext>    for any other size (the size is a user setting).
// The size is not stored in the DB, so it is looked up on disk and remembered.
export function makeThumbFinder(config) {
  const dir = config.dbDir ? path.join(config.dbDir, 'thumbs') : null; // null: no library configured
  const known = new Set(['187x140']); // sizes seen so far; tried first
  let listing = null;                  // cached directory listing, refreshed at most every rescanMs
  let listedAt = 0;
  const rescanMs = config.thumbRescanMs ?? 2000;

  function candidates(row, n) {
    const ext = row.thumbext || 'jpg';
    return [`${row.thumbid}-${n}.${ext}`, ...[...known].map((s) => `${row.thumbid}-${s}-${n}.${ext}`)];
  }
  const firstExisting = (names) => names.map((f) => path.join(dir, f)).find((p) => fs.existsSync(p)) ?? null;

  // Returns the absolute path of thumbnail n of this video, or null.
  return function findThumb(row, n) {
    if (!dir || !row.thumbid || !/^[A-Za-z0-9-]+$/.test(row.thumbid) || !/^[A-Za-z0-9]{1,5}$/.test(row.thumbext || 'jpg')) return null;
    const hit = firstExisting(candidates(row, n));
    if (hit) return hit;
    // maybe a size we haven't seen: learn it from the directory
    const t = Date.now();
    if (!listing || t - listedAt >= rescanMs) {
      try { listing = fs.readdirSync(dir); } catch { listing = []; }
      listedAt = t;
    }
    const prefix = `${row.thumbid}-`;
    for (const name of listing) {
      if (!name.startsWith(prefix)) continue;
      const m = /^(\d+x\d+)-\d+\.[A-Za-z0-9]+$/.exec(name.slice(prefix.length));
      if (m && !known.has(m[1])) known.add(m[1]);
    }
    return firstExisting(candidates(row, n));
  };
}
