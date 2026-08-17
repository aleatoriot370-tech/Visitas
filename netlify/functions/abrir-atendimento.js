/**
 * POST /api/abrir-atendimento  — Etapa 1: status → "Em Atendimento"
 * Body: { idAd, latitude, longitude }
 *
 * POST /api/fechar-atendimento — Etapa 2: status → "Pendente Auditoria"
 * Body: { idAd, observacao }
 */

const { supabaseRequest } = require('./shared/supabase');

const STATUS_EM_ATENDIMENTO = 'Em Atendimento';
const STATUS_PENDENTE_AUDITORIA = 'Pendente Auditoria';

function getTimeZone() {
  return process.env.TIMEZONE || 'America/Sao_Paulo';
}

function agora() {
  return new Date().toLocaleString('sv-SE', { timeZone: getTimeZone() }).replace(' ', 'T');
}

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ---- Abrir Atendimento ----
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ sucesso: false, mensagem: 'Method not allowed' }) };
  }

  try {
    const { idAd, latitude, longitude, acao, observacao } = JSON.parse(event.body || '{}');
    if (!idAd) throw new Error('id_ad não informado.');

    let payload;

    if (acao === 'fechar') {
      // Etapa 2
      payload = {
        status_atendimento: STATUS_PENDENTE_AUDITORIA,
        data_hora_atendimento_fim: agora(),
        observacao: (observacao || '').toString().slice(0, 300),
      };
    } else {
      // Etapa 1 (default)
      payload = {
        status_atendimento: STATUS_EM_ATENDIMENTO,
        data_hora_atendimento_inicio: agora(),
        latitude: latitude != null ? String(latitude) : null,
        longitude: longitude != null ? String(longitude) : null,
      };
    }

    await supabaseRequest('ag_agenda_diaria?id_ad=eq.' + idAd, 'PATCH', payload);
    return ok({ sucesso: true });
  } catch (err) {
    return ok({ sucesso: false, mensagem: 'Erro: ' + err.message });
  }
};
