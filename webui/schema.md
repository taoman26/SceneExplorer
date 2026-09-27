# WebUI schema (schema.md)

## Data sources
The WebUI server reads the data the Qt app already maintains and adds only its own small DB.
It is an **independent process: it must work (browse/search/play/tag) while the Qt app is NOT running**. Scanning and thumbnail
generation remain Qt-only, so new videos appear only after the Qt app scanned them. Video files on unmounted disks are
listed (thumbnails still work) but cannot be streamed – the API answers 404 `file_unavailable` instead of crashing.

### 1. Qt library DB — `<dbdir>/db.sqlite3` (default `~/.local/share/Ambiesoft/SceneExplorer/`) — **read-only**
- `DbInfo(id, dbid TEXT, version)` – `dbid` links to the document DB.
- `FileInfo(id PK, directory, name, size, ctime, wtime, salient, thumbid, duration(sec, REAL-ish), format, bitrate,
  vcodec, acodec, vwidth, vheight, thumbext, fps, recordversion, url, memo)`; unique `(directory,name)`.
  Full path = `directory + name` (`directory` ends with `/`).
- Thumbnails: `<dbdir>/thumbs/<thumbid>-<W>x<H>-<N>.<thumbext>` (currently 187x140, N = 1..10, count varies 3/5/10).

### 2. Qt document DB — `*.scexd` (default `~/Documents/SceneExplorer/default.scexd`) — **read; write only Tag/Tagged/Access**
- `Directories(id, directory, selected, checked, displaytext)` – folders shown in the sidebar.
- `Tag(tagid PK AUTOINCREMENT, tag, yomi, dbid, selected, checked)`
- `Tagged(id, tagid, dbid)` – `id` = `FileInfo.id`; unique `(id,tagid,dbid)`.
- `Access(id, opencount, lastaccess(epoch), dbid)` – unique `(id,dbid)`.
Writes use short transactions with `busy_timeout` because the Qt app may have the file open.

### 3. WebUI DB — `<datadir>/webui.sqlite3` (default `webui/data/`) — owned by the WebUI
```sql
users(id INTEGER PK, username TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL,  -- scrypt "N$salt$hash"
      role TEXT NOT NULL CHECK(role IN ('admin','user','viewer')),
      created_at INT NOT NULL, last_login INT);
sessions(token_hash TEXT PK,  -- sha256 of cookie token
         user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         created_at INT NOT NULL, expires_at INT NOT NULL);
```

## Auth
- First run (no users): `POST /api/auth/setup` creates the admin; afterwards it returns 409.
- Cookie `se_session`: random 32-byte token, `HttpOnly; SameSite=Strict; Path=/` (+`Secure` if HTTPS), 7-day expiry.
- Passwords: min 8 chars, scrypt. Login rate limit: 5 failures / 5 min per IP+username.
- Mutating requests require header `X-Requested-With: SceneExplorer` (CSRF guard on top of SameSite).
- Roles: `admin` (everything + users), `user` (tags, playback counts), `viewer` (read only).
- **Every** `/api/*` (including thumbnails and video streams) except `/api/auth/setup|login|status` requires a session.

## API (JSON, all under `/api`)
| Method & path | Purpose |
|---|---|
| `GET /health` | `{ok:true}` (unauthenticated) |
| `GET /auth/status` | `{needsSetup, user|null}` |
| `POST /auth/setup` `{username,password}` | create first admin, logs in |
| `POST /auth/login` `{username,password}` | sets cookie |
| `POST /auth/logout` | clears session |
| `GET /dirs` | `[{id,directory,displaytext,count}]` |
| `GET /tags` | `[{tagid,tag,count}]` + `untagged` count |
| `GET /videos?dir=&tag=&untagged=1&missing=1&q=&sort=&order=&page=&size=` | `{total,page,size,items:[Video]}` |
| `GET /videos/:id` | `Video` with `thumbs[]`, `tags[]` |
| `GET /videos/:id/thumb/:n` | JPEG thumbnail (n = 1..) |
| `GET /videos/:id/stream[?download=1]` | video file, HTTP Range supported (206/416); missing file → 404 `file_unavailable`. Counts one open in `Access` (upsert) per user+video per 10 min; not counted for `download=1`, for `viewer` role, or when the document is unwritable (playback never fails because of it) |
| `PUT /videos/:id/tags` `{tagids:[..]}` | replace the tag set (role ≥ user), applied as a diff in one `BEGIN IMMEDIATE` transaction; unknown / other-library tag ids → 400 `invalid_tagids`; 404 for unknown video |
| `POST /tags` `{tag}` | create tag (role ≥ user): trimmed NFC, 1–64 chars, no control chars; `yomi` = tag text (Qt dialog default); duplicate → 409 `tag_exists` + `tagid`. `DELETE /tags/:id` deletes the tag **and its `Tagged` rows** (Qt's own delete leaves orphan `Tagged` rows; harmless) |
| (writes) | Qt may hold the document open: writes wait up to 3 s for its lock, then `503 library_busy`; unwritable file → `503 library_readonly`. The server blocks during that wait (synchronous SQLite), so keep transactions tiny |
| `GET /users`, `POST /users` `{username,password,role}` | admin only. List never includes hashes. Usernames are unique case-insensitively (409 `user_exists`) |
| `PATCH /users/:id` `{role?,password?}` | admin only. Role change applies immediately (role is read live per request). Password change signs that user out everywhere (an admin changing their own keeps the current session) |
| `DELETE /users/:id` | admin only; sessions are removed with the user. Refused: self (400 `cannot_delete_self`), last admin (409 `last_admin`; same rule blocks demoting the last admin). Checks run inside `BEGIN IMMEDIATE` |

`Video = {id,directory,name,path,size,wtime,duration,format,bitrate,vcodec,acodec,width,height,fps,opencount,lastaccess,tagids[]}`;
`GET /videos/:id` additionally returns `thumbCount` (probed on disk, contiguous from 1) and `available` (original file exists).
Qt DB/doc missing or unreadable → `503 {error:"library_unavailable"}`; the server itself stays up. `/videos` `size` max 200 (default 48).
Security: paths come from the DB only (never from request input); thumbnail/stream lookups go by numeric id.

## Config (env vars, all optional)
`SE_HOST` (default `0.0.0.0`), `SE_PORT` (`8686`), `SE_DB_DIR`, `SE_DOC_FILE`, `SE_DATA_DIR`.
Defaults follow the Qt app's `QStandardPaths` on Linux, because folder names are localized (e.g. `~/ドキュメント`):
- `SE_DB_DIR` → `$XDG_DATA_HOME/Ambiesoft/SceneExplorer` (`~/.local/share/...`)
- `SE_DOC_FILE` → `<Documents>/SceneExplorer/default.scexd`, where `<Documents>` is `$XDG_DOCUMENTS_DIR`, else `XDG_DOCUMENTS_DIR` in
  `$XDG_CONFIG_HOME/user-dirs.dirs` (`$HOME/...` or absolute), else `~/Documents`.
