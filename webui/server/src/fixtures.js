// Builds a tiny fake Qt library (db.sqlite3 + .scexd + thumbs) from dummy data, for tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DBID = 'test-dbid-0000';
// Fake "video": 1000 known bytes, enough to test Range handling.
export const VIDEO_BYTES = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

export function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'se-fixture-'));
  const dbDir = path.join(root, 'db');
  const mediaA = path.join(root, 'mediaA') + '/';
  const mediaB = path.join(root, 'mediaB') + '/';
  fs.mkdirSync(path.join(dbDir, 'thumbs'), { recursive: true });
  fs.mkdirSync(path.join(mediaA, 'sub'), { recursive: true });
  fs.mkdirSync(mediaB, { recursive: true });

  const lib = new DatabaseSync(path.join(dbDir, 'db.sqlite3'));
  lib.exec(`CREATE TABLE DbInfo(id INTEGER PRIMARY KEY, dbid TEXT, version INT);
    CREATE TABLE FileInfo(id INTEGER PRIMARY KEY, directory TEXT, name TEXT, size INT NOT NULL DEFAULT 0,
      ctime INT NOT NULL DEFAULT 0, wtime INT NOT NULL DEFAULT 0, salient TEXT, thumbid TEXT,
      duration INT NOT NULL DEFAULT 0, format TEXT, bitrate INT NOT NULL DEFAULT 0, vcodec TEXT, acodec TEXT,
      vwidth INT NOT NULL DEFAULT 0, vheight INT NOT NULL DEFAULT 0, thumbext, fps, recordversion, url, memo);`);
  lib.prepare('INSERT INTO DbInfo VALUES (1, ?, 4)').run(DBID);
  const ins = lib.prepare(`INSERT INTO FileInfo(id,directory,name,size,wtime,thumbid,duration,format,bitrate,vcodec,acodec,vwidth,vheight,thumbext,fps)
    VALUES (?,?,?,?,?,?,?,'mp4',1000,'h264','aac',1920,1080,'jpg',30)`);
  // id, dir, name, size, wtime, duration
  const videos = [
    [1, mediaA, 'alpha holiday.mp4', 300, 1000, 60],
    [2, mediaA, 'Beta_100%_done.mp4', 100, 3000, 600],
    [3, mediaA + 'sub/', 'gamma holiday trip.mp4', 200, 2000, 30],
    [4, mediaB, 'delta.mp4', 400, 4000, 120],
    [5, mediaB, 'missing file.mp4', 500, 5000, 10],
  ];
  for (const [id, dir, name, size, wtime, dur] of videos) {
    ins.run(id, dir, name, size, wtime, `thumb-${id}`, dur);
    if (id !== 5) fs.writeFileSync(dir + name, VIDEO_BYTES); // 5 stays "missing"
  }
  lib.close();
  // thumbnails: video 1 has 3, video 2 has 10 (dummy bytes, not real images)
  for (const [id, n] of [[1, 3], [2, 10]]) {
    for (let i = 1; i <= n; i++) fs.writeFileSync(path.join(dbDir, 'thumbs', `thumb-${id}-187x140-${i}.jpg`), `dummy${id}-${i}`);
  }

  const docFile = path.join(root, 'test.scexd');
  const doc = new DatabaseSync(docFile);
  doc.exec(`CREATE TABLE Directories(id INTEGER NOT NULL PRIMARY KEY, directory TEXT, selected INT, checked INT, displaytext);
    CREATE TABLE Access(id INTEGER NOT NULL, opencount INT NOT NULL DEFAULT 0, lastaccess INT, dbid TEXT NOT NULL);
    CREATE UNIQUE INDEX idx_Access_id_dbid ON Access(id,dbid);
    CREATE TABLE Tag(tagid INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, tag, yomi, dbid TEXT NOT NULL, selected INT NOT NULL DEFAULT 0, checked INT NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX idx_Tag_tagid_dbid ON Tag(tagid,dbid);
    CREATE TABLE Tagged(id INTEGER NOT NULL, tagid INTEGER NOT NULL, dbid TEXT NOT NULL);
    CREATE UNIQUE INDEX idx_Tagged_id_tagid_dbid ON Tagged(id,tagid,dbid);`);
  doc.prepare('INSERT INTO Directories VALUES (1,?,0,0,NULL),(2,?,0,0,?)').run(mediaA, mediaB, 'B folder');
  doc.prepare('INSERT INTO Tag(tag,yomi,dbid) VALUES (?,?,?)').run('travel', '', DBID);
  doc.prepare('INSERT INTO Tag(tag,yomi,dbid) VALUES (?,?,?)').run('family', '', DBID);
  doc.prepare('INSERT INTO Tag(tag,yomi,dbid) VALUES (?,?,?)').run('other-lib', '', 'another-dbid');
  const tg = doc.prepare('INSERT INTO Tagged VALUES (?,?,?)');
  tg.run(1, 1, DBID); tg.run(3, 1, DBID); tg.run(3, 2, DBID);
  doc.prepare('INSERT INTO Access VALUES (2, 7, 1700000000, ?)').run(DBID);
  doc.prepare('INSERT INTO Access VALUES (1, 99, 1, ?)').run('another-dbid');
  doc.close();

  return { root, config: { dbDir, docFile }, mediaA, mediaB,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
