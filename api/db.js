/* Arundhati ERP — shared data store (Vercel Serverless Function + Upstash Redis).
 *
 * The whole ERP database is kept as ONE gzipped JSON value in Redis so every visitor
 * sees the same data and admin uploads persist for everyone.
 *   GET  /api/db        -> { ok:true, db:<object|null> }
 *   PUT  /api/db        body { db:<object> }  (POST is accepted too, for sendBeacon)
 *
 * Env vars are provisioned automatically by the Vercel Upstash (KV) marketplace
 * integration: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (KV_* also accepted).
 */
const { Redis } = require('@upstash/redis');
const zlib = require('zlib');

const REDIS_KEY = 'arundhati-erp:db:v3';

let redis;
function client() {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis env vars missing (add the Upstash/KV integration in Vercel → Storage)');
  // automaticDeserialization:false -> we store/read a raw base64 string ourselves.
  redis = new Redis({ url, token, automaticDeserialization: false });
  return redis;
}

const pack = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8')).toString('base64');
const unpack = (s) => JSON.parse(zlib.gunzipSync(Buffer.from(s, 'base64')).toString('utf8'));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = client();

    if (req.method === 'GET') {
      const stored = await r.get(REDIS_KEY);
      const db = stored ? unpack(stored) : null;
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(JSON.stringify({ ok: true, db }));
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
      const db = body ? body.db : undefined;
      if (!db || typeof db !== 'object' || Array.isArray(db)) {
        return res.status(400).json({ ok: false, error: 'Request body must be { db: <object> }' });
      }
      await r.set(REDIS_KEY, pack(db));
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
