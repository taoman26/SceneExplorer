import test from 'node:test';
import assert from 'node:assert/strict';
import { documentsDir, loadConfig, parseUserDirsDocuments } from './config.js';

const HOME = '/home/user';
const files = (map) => (f) => { if (f in map) return map[f]; throw new Error('ENOENT'); };
const UD = '/home/user/.config/user-dirs.dirs';

test('default is ~/Documents when nothing else is defined', () => {
  assert.equal(documentsDir({}, HOME, files({})), '/home/user/Documents');
});

test('localized folder name from user-dirs.dirs (Japanese desktop)', () => {
  const text = '# comment\nXDG_DESKTOP_DIR="$HOME/デスクトップ"\nXDG_DOCUMENTS_DIR="$HOME/ドキュメント"\n';
  assert.equal(documentsDir({}, HOME, files({ [UD]: text })), '/home/user/ドキュメント');
  assert.equal(loadConfig({}, { home: HOME, readFile: files({ [UD]: text }) }).docFile, '/home/user/ドキュメント/SceneExplorer/default.scexd');
});

test('parse: absolute path, single quotes, escapes, spaces, last definition wins, junk ignored', () => {
  assert.equal(parseUserDirsDocuments('XDG_DOCUMENTS_DIR="/data/docs"', HOME), '/data/docs');
  assert.equal(parseUserDirsDocuments("XDG_DOCUMENTS_DIR='$HOME/My Docs'", HOME), '/home/user/My Docs');
  assert.equal(parseUserDirsDocuments('XDG_DOCUMENTS_DIR="$HOME/My \\"Docs\\""', HOME), '/home/user/My "Docs"');
  assert.equal(parseUserDirsDocuments('XDG_DOCUMENTS_DIR="$HOME/a b"', HOME), '/home/user/a b');
  assert.equal(parseUserDirsDocuments('XDG_DOCUMENTS_DIR="$HOME/one"\nXDG_DOCUMENTS_DIR="$HOME/two"', HOME), '/home/user/two');
  assert.equal(parseUserDirsDocuments('XDG_DOCUMENTS_DIR="$HOME"', HOME), '/home/user');
  assert.equal(parseUserDirsDocuments('XDG_DOCUMENTS_DIR="relative/dir"', HOME), null); // invalid per the spec
  assert.equal(parseUserDirsDocuments('# XDG_DOCUMENTS_DIR="/x"\nXDG_DOWNLOAD_DIR="/y"', HOME), null);
  assert.equal(parseUserDirsDocuments('XDG_DOCUMENTS_DIR="$HOMEX/foo"', HOME), null); // not "$HOME/"
  assert.equal(parseUserDirsDocuments('XDG_DOCUMENTS_DIR="/data/docs"\r\n', HOME), '/data/docs'); // CRLF
});

test('$HOME in a value only counts as a prefix followed by / or end', () => {
  assert.equal(parseUserDirsDocuments('XDG_DOCUMENTS_DIR="$HOME/x"', '/h'), '/h/x');
});

test('XDG_DOCUMENTS_DIR env and XDG_CONFIG_HOME are honoured; env wins', () => {
  assert.equal(documentsDir({ XDG_DOCUMENTS_DIR: '/env/docs' }, HOME, files({ [UD]: 'XDG_DOCUMENTS_DIR="$HOME/x"' })), '/env/docs');
  const cfg = '/cfg/user-dirs.dirs';
  assert.equal(documentsDir({ XDG_CONFIG_HOME: '/cfg' }, HOME, files({ [cfg]: 'XDG_DOCUMENTS_DIR="$HOME/Dokumente"' })), '/home/user/Dokumente');
  assert.equal(documentsDir({ XDG_DOCUMENTS_DIR: 'relative' }, HOME, files({})), '/home/user/Documents'); // relative env ignored
});

test('a malformed or unreadable user-dirs.dirs falls back to ~/Documents', () => {
  assert.equal(documentsDir({}, HOME, files({ [UD]: 'garbage\n\u0000\n' })), '/home/user/Documents');
  assert.equal(documentsDir({}, HOME, () => { throw new Error('EACCES'); }), '/home/user/Documents');
});

test('SE_DOC_FILE / SE_DB_DIR override; XDG_DATA_HOME moves the default database directory', () => {
  const c = loadConfig({ SE_DOC_FILE: '/x/y.scexd', SE_DB_DIR: '/db' }, { home: HOME, readFile: files({}) });
  assert.deepEqual([c.docFile, c.dbDir], ['/x/y.scexd', '/db']);
  assert.equal(loadConfig({}, { home: HOME, readFile: files({}) }).dbDir, '/home/user/.local/share/Ambiesoft/SceneExplorer');
  assert.equal(loadConfig({ XDG_DATA_HOME: '/xdg/data' }, { home: HOME, readFile: files({}) }).dbDir, '/xdg/data/Ambiesoft/SceneExplorer');
});
