/**
 * POST /api/upload-photo  — Upload photo to MEGA + register in fotos_vis
 * Body: { idAd, idClientes, base64Data, tipo, indice }
 * Returns: { sucesso, nome, link }
 *
 * A imagem é salva no MEGA e a URL pública é registrada no
 * fotos_vis.Loc_Foto. Base64 só é usado como fallback se o MEGA falhar.
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
      return ok({ sucesso: false, mensagem: 'Parâmetros obrigatórios ausentes (idAd, base64Data, tipo).' });
    }

    // 1. Gera nome do arquivo
    const timestamp = Date.now();
    const sufixo = indice ? '_' + indice : '';
    const nomeArquivo = `cliente${idClientes}_${tipo}_${timestamp}${sufixo}.webp`;

    // 2. Upload para MEGA
    let megaLink = null;
    try {
      const puro = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(puro, 'base64');
      const result = await uploadToMega(buffer, nomeArquivo);
      megaLink = result.link;
      console.log('MEGA upload OK:', nomeArquivo, megaLink);
    } catch (megaErr) {
      console.warn('MEGA upload falhou (usando base64 como fallback):', megaErr.message);
    }

    // 3. Registra no Supabase — URL do MEGA (leve) ou base64 (fallback)
    const locFoto = (megaLink && megaLink.startsWith('https://')) ? megaLink : base64Data;
    console.log('Storing locFoto:', locFoto.substring(0, 80) + '...');

    try {
      await supabaseRequest('fotos_vis', 'POST', {
        id_vis: idAd,
        Nome_Foto: nomeArquivo,
        Tipo: tipo,
        Loc_Foto: locFoto,
      });
    } catch (dbErr) {
      console.error('Supabase insert error:', dbErr.message);
      return ok({ sucesso: false, mensagem: 'Falhou ao registrar foto no banco: ' + dbErr.message });
    }

    return ok({ sucesso: true, nome: nomeArquivo, link: megaLink || 'salvo_no_banco' });
  } catch (err) {
    console.error('upload-photo error:', err.message);
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
