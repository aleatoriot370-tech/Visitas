/**
 * POST /api/upload-photo  — Upload photo to MEGA + register in fotos_vis
 * Body: { idAd, idClientes, base64Data, tipo, indice }
 * Returns: { sucesso, nome, link }
 */

const { supabaseRequest } = require('./shared/supabase');
const { uploadToMega } = require('./shared/mega');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ sucesso: false, mensagem: 'Method not allowed' }) };
  }

  try {
    const { idAd, idClientes, base64Data, tipo, indice } = JSON.parse(event.body || '{}');

    if (!idAd || !base64Data || !tipo) {
      return ok({ sucesso: false, mensagem: 'Parâmetros obrigatórios ausentes.' });
    }

    // Strip data-URL prefix if present
    const puro = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(puro, 'base64');

    // Generate filename
    const timestamp = Date.now();
    const sufixo = indice ? '_' + indice : '';
    const nomeArquivo = `cliente${idClientes}_${tipo}_${timestamp}${sufixo}.webp`;

    // Upload to MEGA
    const { link } = await uploadToMega(buffer, nomeArquivo);

    // Register in Supabase
    await supabaseRequest('fotos_vis', 'POST', {
      id_vis: idAd,
      Nome_Foto: nomeArquivo,
      Tipo: tipo,
      Loc_Foto: link,
    });

    return ok({ sucesso: true, nome: nomeArquivo, link });
  } catch (err) {
    return ok({ sucesso: false, mensagem: 'Erro ao salvar foto: ' + err.message });
  }
};

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
