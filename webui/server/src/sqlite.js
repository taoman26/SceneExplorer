// Node 12 has no node:sqlite; this gives better-sqlite3 the small DatabaseSync surface the server uses
// (new DatabaseSync(file, { readOnly }), exec, prepare().get/all/run, close).
import Database from 'better-sqlite3';

export function DatabaseSync(file, options) {
  return new Database(file, { readonly: !!(options && options.readOnly) });
}
