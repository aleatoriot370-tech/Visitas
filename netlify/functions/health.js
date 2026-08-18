/**
 * GET /api/health — Diagnóstico do ambiente
 */

const { supabaseRequest } = require('./shared/supabase');

exports.handler = async (event) => {
  const checks = {};

  // 1. Env vars
  checks.SUPABASE_URL = !!process.env.SUPABASE_URL;
  checks.SUPABASE_SERVICE_KEY = !!process.env.SUPABASE_SERVICE_KEY;
  checks.MEGA_EMAIL = !!process.env.MEGA_EMAIL;
  checks.MEGA_PASSWORD = !!process.env.MEGA_PASSWORD;
  checks.TIMEZONE = process.env.TIMEZONE || 'America/Sao_Paulo (default)';
  checks.nodeVersion = process.version;

  // 2. Supabase connection test
  try {
    const result = await supabaseRequest('Users?select=id_user&limit=1', 'GET');
    checks.supabaseConnection = 'OK';
    checks.supabaseSample = result;
  } catch (err) {
    checks.supabaseConnection = 'FAILED';
    checks.supabaseError = err.message;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sucesso: true, checks }, null, 2),
  };
};
