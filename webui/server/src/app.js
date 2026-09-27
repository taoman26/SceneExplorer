import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { openWebuiDb } from './db.js';
import { createAuth, csrfGuard } from './auth.js';
import { createLibraryRouter } from './library.js';
import { createMediaRouter } from './media.js';
import { createPlayTokenStore, createPlayTokenRouter } from './playtokens.js';
import { createStreamRouter } from './stream.js';
import { createTagsRouter } from './tags.js';
import { createUsersRouter } from './users.js';

export function createApp(config, { limiter } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('config', config);

  const db = openWebuiDb(config.dataDir);
  app.locals.db = db;
  const auth = createAuth(db, { limiter });
  const playTokens = createPlayTokenStore(db);

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    });
    next();
  });

  app.use('/api', express.json({ limit: '10kb' }), csrfGuard, auth.attachUser);

  // Public
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', auth.router);

  // The stream route authenticates itself (session cookie OR a play token scoped to that video), so an external
  // player such as VLC, which sends no cookie, can fetch it. It must be mounted before the blanket gate below.
  app.use('/api', createStreamRouter(config, playTokens));

  // Everything below this line requires a session.
  app.use('/api', auth.requireAuth);
  app.locals.auth = auth;
  app.use('/api', createLibraryRouter(config));
  app.use('/api', createMediaRouter(config));
  app.use('/api', createPlayTokenRouter(config, playTokens));
  app.use('/api', createTagsRouter(config, auth.requireRole));
  app.use('/api', createUsersRouter(db, auth.requireRole));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // Built React client (only the app bundle; all data comes through the authenticated API).
  const clientDir = config.clientDir && path.resolve(config.clientDir);
  if (clientDir && fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    // SPA fallback so /login, /?dir=1 ... work on reload.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html'), { maxAge: 0 }));
  }

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    console.error(err);
    res.status(500).json({ error: 'internal' });
  });
  return app;
}
