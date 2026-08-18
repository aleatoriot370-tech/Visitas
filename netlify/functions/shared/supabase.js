/**
 * Supabase REST helper — used by all Netlify Functions.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getBaseUrl() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  }
  return SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';
}

/**
 * @param {string} pathWithQuery  e.g. "ag_agenda_diaria?select=..."
 * @param {string} method         GET | POST | PATCH | DELETE
 * @param {Object} [payload]
 * @returns {Promise<any>}
 */
async function supabaseRequest(pathWithQuery, method, payload) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (method === 'POST' || method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
  }

  const opts = { method: method || 'GET', headers };
  if (payload != null) opts.body = JSON.stringify(payload);

  const BASE = getBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s — Netlify limit is 10s

  try {
    opts.signal = controller.signal;
    const res = await fetch(BASE + pathWithQuery, opts);
    const text = await res.text();

    if (res.ok) {
      return text ? JSON.parse(text) : null;
    }
    throw new Error(`Supabase [${res.status}]: ${text}`);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { supabaseRequest };
