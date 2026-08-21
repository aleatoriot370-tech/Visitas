/**
 * POST /api/upload-photo  — Upload photo to Supabase Storage + register in fotos_vis
 * Body: { idAd, idClientes, base64Data, tipo, indice }
 * Returns: { sucesso, nome, link }
 *
 * A imagem é salva no Storage (bucket público "fotos-visitas") e a URL
 * pública é registrada direto em fotos_vis.Loc_Foto — o frontend usa a
 * URL como veio, sem proxy.
 */

const { supabaseRequest } = require('./shared/supabase');
const { uploadToStorage } = require('./shared/storage');

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

    // 2. Upload para Supabase Storage (backup — não bloqueia se falhar)
    let storageLink = null;
    try {
      const puro = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/webp';
      const buffer = Buffer.from(puro, 'base64');
      const objectPath = `visita-${idAd}/${nomeArquivo}`;
      const result = await uploadToStorage(buffer, objectPath, mime);
      storageLink = result.link;
      console.log('Storage upload OK:', nomeArquivo, storageLink);
    } catch (storageErr) {
      console.warn('Storage upload falhou (continuando):', storageErr.message);
    }

    // 3. Registra no Supabase — salva URL do Storage (leve) ao invés de base64 (pesado)
    const locFoto = storageLink || base64Data; // fallback para base64 se o Storage falhar

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

    return ok({ sucesso: true, nome: nomeArquivo, link: storageLink || 'salvo_no_banco' });
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
