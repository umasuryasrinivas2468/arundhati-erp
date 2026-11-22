/* Arundhati ERP — shared data store (Next.js Route Handler + Upstash Redis).
 *
 * Identical contract to the original static build's /api/db serverless function:
 *   GET  /api/db        -> { ok:true, db:<object|null> }
 *   PUT  /api/db        body { db:<object> }   (POST accepted too, for sendBeacon)
 *
 * The whole ERP database is kept as ONE gzipped JSON value in Redis so every visitor
 * sees the same data and admin uploads persist for everyone.
 *
 * Env vars are provisioned by the Vercel Upstash (KV) marketplace integration:
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (KV_* also accepted).
 */
import { Redis } from '@upstash/redis';
import zlib from 'zlib';

export const dynamic = 'force-dynamic'; // never cache this handler

const REDIS_KEY = 'arundhati-erp:db:v3';

let redis;
function client() {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis env vars missing (add the Upstash/KV integration in Vercel → Storage)');
  redis = new Redis({ url, token, automaticDeserialization: false });
  return redis;
}

const pack = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8')).toString('base64');
const unpack = (s) => JSON.parse(zlib.gunzipSync(Buffer.from(s, 'base64')).toString('utf8'));

const noStore = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };

export async function GET() {
  try {
    const r = client();
    const stored = await r.get(REDIS_KEY);
    const db = stored ? unpack(stored) : null;
    return new Response(JSON.stringify({ ok: true, db }), { status: 200, headers: noStore });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e && e.message) || e) }), { status: 500, headers: noStore });
  }
}

async function write(req) {
  try {
    const r = client();
    let body = await req.text();
    try { body = JSON.parse(body); } catch (e) { body = null; }
    const db = body ? body.db : undefined;
    if (!db || typeof db !== 'object' || Array.isArray(db)) {
      return new Response(JSON.stringify({ ok: false, error: 'Request body must be { db: <object> }' }), { status: 400, headers: noStore });
    }
    await r.set(REDIS_KEY, pack(db));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: noStore });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e && e.message) || e) }), { status: 500, headers: noStore });
  }
}

export const PUT = write;
export const POST = write;
