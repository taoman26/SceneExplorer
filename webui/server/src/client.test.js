import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';

test('serves the built client with SPA fallback; /api is never shadowed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'se-client-'));
  const clientDir = path.join(root, 'dist');
  fs.mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(clientDir, 'index.html'), '<title>app</title>');
  fs.writeFileSync(path.join(clientDir, 'assets/a.js'), 'console.log(1)');
  const app = createApp({ dataDir: path.join(root, 'data'), clientDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let r = await fetch(`${base}/`);
    assert.equal(await r.text(), '<title>app</title>');
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await (await fetch(`${base}/login`)).text(), '<title>app</title>'); // SPA route
    assert.equal(await (await fetch(`${base}/assets/a.js`)).text(), 'console.log(1)');
    r = await fetch(`${base}/api/videos`); // stays JSON 401, not index.html
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error, 'unauthenticated');
    assert.equal((await fetch(`${base}/assets/../../etc/passwd`)).status, 200); // normalised to /etc/passwd -> SPA page, not a file
    assert.ok(!(await (await fetch(`${base}/..%2f..%2fetc/passwd`)).text()).includes('root:'));
  } finally { server.close(); app.locals.db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('no client build -> API still works', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'se-client-'));
  const app = createApp({ dataDir: path.join(root, 'data'), clientDir: path.join(root, 'none') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/health`)).status, 200);
  } finally { server.close(); app.locals.db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
