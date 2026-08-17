/**
 * POST /api/auth  — Login
 * Body: { login, senha }
 * Returns: { sucesso, mensagem, usuario }
 */

const { supabaseRequest } = require('./shared/supabase');

const TIPOS_PERMITIDOS = ['Admin Senior', 'Admin Junior', 'Users'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ sucesso: false, mensagem: 'Method not allowed' }) };
  }

  try {
    const { login, senha } = JSON.parse(event.body || '{}');

    if (!login || !senha) {
      return ok({ sucesso: false, mensagem: 'Informe login e senha.' });
    }

    const resultado = await supabaseRequest('rpc/check_user_password', 'POST', {
      p_login: login,
      p_senha: senha,
    });

    const dados = Array.isArray(resultado) ? resultado[0] : resultado;

    if (!dados || !dados.sucesso) {
      return ok({ sucesso: false, mensagem: (dados && dados.mensagem) || 'Login ou senha inválidos.' });
    }

    const tipo = dados.tipo || dados.Tipo || (dados.usuario && dados.usuario.Tipo);
    if (TIPOS_PERMITIDOS.indexOf(tipo) === -1) {
      return ok({ sucesso: false, mensagem: 'Usuário não autorizado, entre em contato com o administrador.' });
    }

    return ok({ sucesso: true, usuario: dados.usuario || dados });
  } catch (err) {
    return ok({ sucesso: false, mensagem: 'Erro ao autenticar: ' + err.message });
  }
};

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
