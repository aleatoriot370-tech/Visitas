/**
 * Supabase Storage upload helper.
 *
 * Substitui o upload para MEGA (shared/mega.js) — mesma bucket usada pela
 * migração feita no painel Auditoria: "fotos-visitas" (pública).
 *
 * Env vars (as mesmas já usadas por shared/supabase.js):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'fotos-visitas';

/**
 * Upload a Buffer to Supabase Storage and return its public URL.
 *
 * @param {Buffer} buffer
 * @param {string} objectPath  e.g. "visita-123/cliente1_Fachada_169....webp"
 * @param {string} mime
 * @returns {Promise<{link: string}>}
 */
async function uploadToStorage(buffer, objectPath, mime) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  }

  const base = SUPABASE_URL.replace(/\/+$/, '');
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': mime || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: buffer,
  });

  if (!res.ok) {
    throw new Error(`Storage upload [${res.status}]: ${await res.text()}`);
  }

  return { link: `${base}/storage/v1/object/public/${BUCKET}/${objectPath}` };
}

module.exports = { uploadToStorage };
