/**
 * GET /api/mega-proxy?id=FILE_ID&k=KEY
 *
 * Proxy that downloads a public MEGA file, decrypts it (AES-128-CTR),
 * and serves it as an image with browser cache headers.
 *
 * MEGA encryption:
 *   1. Key (base64url) → 8 × 32-bit integers
 *   2. AES key = key[0]^key[4], key[1]^key[5], key[2]^key[6], key[3]^key[7]
 *   3. IV = key[4], key[5], 0, 0
 *   4. File is AES-128-CTR encrypted
 */

const crypto = require('crypto');

// ── MEGA crypto helpers ─────────────────────────────────────────────

function base64UrlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function a32ToBuf(a) {
  const buf = Buffer.alloc(a.length * 4);
  for (let i = 0; i < a.length; i++) buf.writeUInt32BE(a[i] >>> 0, i * 4);
  return buf;
}

function parseMegaKey(keyB64) {
  const keyBytes = base64UrlDecode(keyB64);
  const key32 = [];
  for (let i = 0; i < keyBytes.length; i += 4) key32.push(keyBytes.readUInt32BE(i));
  const k = [
    (key32[0] ^ key32[4]) >>> 0,
    (key32[1] ^ key32[5]) >>> 0,
    (key32[2] ^ key32[6]) >>> 0,
    (key32[3] ^ key32[7]) >>> 0,
  ];
  return { k, iv0: key32[4] >>> 0, iv1: key32[5] >>> 0 };
}

function buildCtrNonce(iv0, iv1) {
  const nonce = Buffer.alloc(16);
  nonce.writeUInt32BE(iv0, 0);
  nonce.writeUInt32BE(iv1, 4);
  return nonce;
}

// ── MEGA API ────────────────────────────────────────────────────────

async function megaApiGet(fileId) {
  const resp = await fetch('https://g.api.mega.co.nz/cs?id=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ a: 'g', g: 1, p: fileId }]),
  });
  if (!resp.ok) throw new Error('MEGA API error: ' + resp.status);
  const json = await resp.json();
  if (typeof json === 'number') throw new Error('MEGA API error code: ' + json);
  const data = Array.isArray(json) ? json[0] : json;
  if (!data?.g) throw new Error('MEGA file not found or not public');
  return data;
}

async function downloadMegaFile(fileId, keyB64) {
  const { k, iv0, iv1 } = parseMegaKey(keyB64);
  const meta = await megaApiGet(fileId);
  const resp = await fetch(meta.g);
  if (!resp.ok) throw new Error('Download failed: ' + resp.status);
  const encBuf = Buffer.from(await resp.arrayBuffer());
  const aesKey = a32ToBuf(k);
  const nonce = buildCtrNonce(iv0, iv1);
  const decipher = crypto.createDecipheriv('aes-128-ctr', aesKey, nonce);
  const decBuf = Buffer.concat([decipher.update(encBuf), decipher.final()]);
  let mime = 'image/jpeg';
  if (decBuf[0] === 0x89 && decBuf[1] === 0x50) mime = 'image/png';
  else if (decBuf[8] === 0x57 && decBuf[9] === 0x45) mime = 'image/webp';
  else if (decBuf[0] === 0x47 && decBuf[1] === 0x49) mime = 'image/gif';
  return { data: decBuf, mime };
}

// ── Route handler ───────────────────────────────────────────────────

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const fileId = params.id;
  const key = params.k;

  if (!fileId || !key) {
    return { statusCode: 400, body: 'Missing ?id= and/or ?k= params' };
  }

  try {
    const { data, mime } = await downloadMegaFile(fileId, key);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
      },
      body: data.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('[mega-proxy] error:', err.message);
    return { statusCode: 502, body: 'MEGA error: ' + err.message };
  }
};
