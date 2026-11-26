/* Arundhati ERP — self-hosted server (EC2): static files + /api/* + SQLite. Node >= 22.13, no npm deps.
 *
 *   node server.js                      serve on PORT (default 3000)
 *   node server.js import <db.json>     load a full ERP JSON blob (e.g. exported from Supabase)
 *
 * Env: PORT, DB_PATH (default ./data/erp.db — keep it OUTSIDE the served folders),
 *      SESSION_SECRET (optional; without it a random one is made at startup, so a restart signs everyone out).
 * The API itself lives in lib/api.js (shared with the Vercel deployment, api/handler.js).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { createApi, stripPasswords, hash, json, STUBS } = require('./lib/api.js');

const ROOT = __dirname;
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'erp.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const sql = new DatabaseSync(DB_PATH);
sql.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS state (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS passwords (empId TEXT PRIMARY KEY, hash TEXT NOT NULL);`);

const ROW = 'arundhati-erp:v3';
// The whole ERP state is one JSON row, cached in memory (single process, so the cache is the truth
// and writes can't race: `ver` is unused).
let cache;
const store = {
  async load() {
    if (cache === undefined) { const r = sql.prepare('SELECT data FROM state WHERE id=?').get(ROW); cache = r ? JSON.parse(r.data) : null; }
    return { db: cache, ver: null };
  },
  async save(db) {
    sql.prepare('INSERT INTO state VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at')
      .run(ROW, JSON.stringify(db), new Date().toISOString());
    cache = db;
    return true;
  },
  async getHash(empId) { return sql.prepare('SELECT hash FROM passwords WHERE empId=?').get(String(empId))?.hash; },
  async setPassword(empId, pw) { sql.prepare('INSERT INTO passwords VALUES (?,?) ON CONFLICT(empId) DO UPDATE SET hash=excluded.hash').run(String(empId), hash(pw)); },
  async deletePassword(empId) { sql.prepare('DELETE FROM passwords WHERE empId=?').run(String(empId)); },
};

if (process.argv[2] === 'import') {
  (async () => {
    const db = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const blob = db.db || db.data || db; // accepts {db}, a Supabase row {data}, or the raw blob
    sql.exec('BEGIN'); await store.save(await stripPasswords(blob, store)); sql.exec('COMMIT');
    console.log(`imported ${blob.users?.length ?? 0} users into ${DB_PATH}`);
  })();
  return;
}

const api = createApi(store, process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };
const PUBLIC_DIRS = new Set(['js', 'css', 'assets']);

function serveStatic(req, res, p) {
  if (p === '/') p = '/index.html';
  if (STUBS[p]) { res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache' }); return res.end(STUBS[p]); }
  const parts = p.split('/').filter(Boolean);
  const ok = parts.every((x) => !x.startsWith('.')) &&
    ((parts.length === 1 && parts[0].endsWith('.html')) || (parts.length > 1 && PUBLIC_DIRS.has(parts[0])));
  const file = path.join(ROOT, ...parts);
  if (!ok || !file.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p.startsWith('/api/')) return api(req, res, p).catch((e) => json(res, 500, { ok: false, error: String(e.message || e) }));
  serveStatic(req, res, p);
}).listen(process.env.PORT || 3000, '127.0.0.1', () => console.log(`arundhati-erp on 127.0.0.1:${process.env.PORT || 3000}, db ${DB_PATH}`));
