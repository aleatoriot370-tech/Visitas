/**
 * GET /api/visitas?idVendedor=123  — Lista de visitas do dia
 * Returns: { sucesso, visitas }
 */

const { supabaseRequest } = require('./shared/supabase');

function getTimeZone() {
  return process.env.TIMEZONE || 'America/Sao_Paulo';
}

function hoje() {
  return new Date().toLocaleDateString('en-CA', { timeZone: getTimeZone() }); // yyyy-MM-dd
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ sucesso: false, mensagem: 'Method not allowed' }) };
  }

  try {
    const idVendedor = event.queryStringParameters && event.queryStringParameters.idVendedor;
    if (!idVendedor) throw new Error('idVendedor não informado.');

    const dataHoje = hoje();

    const select = [
      'select=id_ad,id_a,id_clientes,status_atendimento,data_hora_atendimento_inicio,',
      'data_hora_atendimento_fim,observacao,latitude,longitude,',
      'Clientes(Codigo,Razao),',
      'ag_agenda!inner(id_agenda,data_agenda,id_vendedor,placa),',
      'fotos_vis(Nome_Foto,Tipo,Loc_Foto)',
    ].join('');

    const query =
      select +
      '&ag_agenda.data_agenda=eq.' + dataHoje +
      '&ag_agenda.id_vendedor=eq.' + idVendedor +
      '&order=id_clientes.asc';

    const linhas = await supabaseRequest('ag_agenda_diaria?' + query, 'GET');
    return ok({ sucesso: true, visitas: linhas || [] });
  } catch (err) {
    return ok({ sucesso: false, mensagem: 'Erro ao carregar visitas: ' + err.message, visitas: [] });
  }
};

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
