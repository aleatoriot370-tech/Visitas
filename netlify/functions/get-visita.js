/**
 * GET /api/get-visita?idAd=123  — Detalhes de uma visita (com fotos)
 * Returns: { sucesso, visita }
 */

const { supabaseRequest } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ sucesso: false, mensagem: 'Method not allowed' }) };
  }

  try {
    const idAd = event.queryStringParameters && event.queryStringParameters.idAd;
    if (!idAd) throw new Error('idAd não informado.');

    const query =
      'select=id_ad,id_a,id_clientes,status_atendimento,data_hora_atendimento_inicio,' +
      'data_hora_atendimento_fim,observacao,latitude,longitude,' +
      'Clientes(Codigo,Razao),' +
      'fotos_vis(Nome_Foto,Tipo,Loc_Foto)&id_ad=eq.' + idAd;

    const linhas = await supabaseRequest('ag_agenda_diaria?' + query, 'GET');
    if (!linhas || !linhas.length) {
      return ok({ sucesso: false, mensagem: 'Visita não encontrada.' });
    }

    return ok({ sucesso: true, visita: linhas[0] });
  } catch (err) {
    return ok({ sucesso: false, mensagem: 'Erro ao carregar visita: ' + err.message });
  }
};

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
