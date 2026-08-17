/**
 * APP DE ROTAS E VISITAS — GRUPO LAMOIA
 * Backend Google Apps Script + Supabase (PostgREST)
 *
 * Propriedades de Script necessárias (Arquivo > Propriedades do projeto > Propriedades do script):
 *   SUPABASE_URL           -> ex: https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_KEY   -> chave service_role (ou chave com policy adequada de leitura/escrita)
 *   DRIVE_FOLDER_ID        -> ID da pasta do Google Drive onde as fotos serão salvas
 *   TIMEZONE (opcional)    -> ex: America/Sao_Paulo (padrão usado se não definido)
 *
 * ====================================================================
 * FLUXO DO ATENDIMENTO (em 2 etapas)
 * --------------------------------------------------------------------
 * 1) Status 'Pendente' -> Usuário abre o cliente, anexa fotos Fachada+Antes,
 *    clica em "Abrir Atendimento":
 *      - Salva fotos no Drive + fotos_vis
 *      - Atualiza ag_agenda_diaria:
 *          status_atendimento = 'Em Atendimento'
 *          data_hora_atendimento_inicio = agora
 *          latitude / longitude
 *
 * 2) Status 'Em Atendimento' -> Usuário reabre o cliente (com dados já salvos carregados),
 *    anexa fotos Depois + observação, clica em "Fecha Atendimento":
 *      - Salva novas fotos no Drive + fotos_vis
 *      - Atualiza ag_agenda_diaria:
 *          status_atendimento = 'Pendente Auditoria'
 *          data_hora_atendimento_fim = agora
 *          observacao
 *
 * 3) Status 'Pendente Auditoria' -> Tela somente leitura (apenas visualização).
 * ====================================================================
 */

var TIPOS_PERMITIDOS = ['Admin Senior', 'Admin Junior', 'Users'];

// Status possíveis em ag_agenda_diaria.status_atendimento
var STATUS_PENDENTE = 'Pendente';
var STATUS_EM_ATENDIMENTO = 'Em Atendimento';
var STATUS_PENDENTE_AUDITORIA = 'Pendente Auditoria';

// ==================================================================
// WEB APP ENTRY POINT
// ==================================================================

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Grupo Lamoia | Rotas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getTimeZone_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('TIMEZONE') || Session.getScriptTimeZone() || 'America/Sao_Paulo';
}

// ==================================================================
// CONFIG / SUPABASE HELPERS
// ==================================================================

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var cfg = {
    SUPABASE_URL: props.getProperty('SUPABASE_URL'),
    SUPABASE_KEY: props.getProperty('SUPABASE_SERVICE_KEY'),
    DRIVE_FOLDER_ID: props.getProperty('DRIVE_FOLDER_ID')
  };
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_KEY) {
    throw new Error('Configuração ausente: defina SUPABASE_URL e SUPABASE_SERVICE_KEY em Propriedades do Script.');
  }
  return cfg;
}

/**
 * Executa uma requisição na API REST do Supabase (PostgREST).
 * @param {string} pathWithQuery - ex: "ag_agenda_diaria?id_ad=eq.10" ou "rpc/check_user_password"
 * @param {string} method - GET | POST | PATCH | DELETE
 * @param {Object} [payload] - corpo da requisição (será serializado em JSON)
 */
function supabaseRequest_(pathWithQuery, method, payload) {
  var cfg = getConfig_();
  var url = cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + pathWithQuery;

  var headers = {
    apikey: cfg.SUPABASE_KEY,
    Authorization: 'Bearer ' + cfg.SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  if (method === 'POST' || method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
  }

  var options = {
    method: (method || 'GET').toLowerCase(),
    headers: headers,
    muteHttpExceptions: true
  };
  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  var text = res.getContentText();

  if (code >= 200 && code < 300) {
    return text ? JSON.parse(text) : null;
  }
  throw new Error('Supabase [' + code + ']: ' + text);
}

// ==================================================================
// MÓDULO 1 — AUTENTICAÇÃO
// ==================================================================

/**
 * Chamado pelo cliente para autenticar o usuário.
 * @param {string} login
 * @param {string} senha
 * @return {Object} { sucesso, mensagem, usuario }
 */
function loginUser(login, senha) {
  try {
    if (!login || !senha) {
      return { sucesso: false, mensagem: 'Informe login e senha.' };
    }

    var resultado = supabaseRequest_('rpc/check_user_password', 'POST', {
      p_login: login,
      p_senha: senha
    });

    var dados = Array.isArray(resultado) ? resultado[0] : resultado;

    if (!dados || !dados.sucesso) {
      return { sucesso: false, mensagem: (dados && dados.mensagem) || 'Login ou senha inválidos.' };
    }

    var tipo = dados.tipo || dados.Tipo || (dados.usuario && dados.usuario.Tipo);
    if (TIPOS_PERMITIDOS.indexOf(tipo) === -1) {
      return { sucesso: false, mensagem: 'Usuário não autorizado, entre em contato com o administrador.' };
    }

    return { sucesso: true, usuario: dados.usuario || dados };
  } catch (err) {
    return { sucesso: false, mensagem: 'Erro ao autenticar: ' + err.message };
  }
}

// ==================================================================
// MÓDULO 2 — LISTA DE VISITAS DO DIA
// ==================================================================

/**
 * Retorna as visitas do dia para o vendedor logado, incluindo contagem de fotos por visita.
 * @param {number} idVendedor
 */
function getVisitasHoje(idVendedor) {
  try {
    if (!idVendedor) throw new Error('idVendedor não informado.');

    var hoje = Utilities.formatDate(new Date(), getTimeZone_(), 'yyyy-MM-dd');

    var select = [
      'select=id_ad,id_a,id_clientes,status_atendimento,data_hora_atendimento_inicio,',
      'data_hora_atendimento_fim,observacao,latitude,longitude,',
      'Clientes(Codigo,Razao),',
      'ag_agenda!inner(id_agenda,data_agenda,id_vendedor,placa),',
      'fotos_vis(Nome_Foto,Tipo,Loc_Foto)'
    ].join('');

    var query = select +
      '&ag_agenda.data_agenda=eq.' + hoje +
      '&ag_agenda.id_vendedor=eq.' + idVendedor +
      '&order=id_clientes.asc';

    var linhas = supabaseRequest_('ag_agenda_diaria?' + query, 'GET');
    return { sucesso: true, visitas: linhas || [] };
  } catch (err) {
    return { sucesso: false, mensagem: 'Erro ao carregar visitas: ' + err.message, visitas: [] };
  }
}

/**
 * Retorna os detalhes completos de uma visita específica (incluindo fotos salvas),
 * usado para reabrir o formulário em qualquer status.
 *
 * Observação: converte URLs antigas do Drive (formato `drive.google.com/uc?id=`)
 * para o formato novo (`lh3.googleusercontent.com/d/{id}`) em tempo de execução,
 * para garantir que as fotos já gravadas continuem carregando nas telas de
 * "Fecha Atendimento" e "Auditoria".
 */
function getVisita(idAd) {
  try {
    var query = 'select=id_ad,id_a,id_clientes,status_atendimento,data_hora_atendimento_inicio,' +
      'data_hora_atendimento_fim,observacao,latitude,longitude,' +
      'Clientes(Codigo,Razao),' +
      'fotos_vis(Nome_Foto,Tipo,Loc_Foto)&id_ad=eq.' + idAd;
    var linhas = supabaseRequest_('ag_agenda_diaria?' + query, 'GET');
    if (!linhas || !linhas.length) return { sucesso: false, mensagem: 'Visita não encontrada.' };

    var visita = linhas[0];
    if (visita.fotos_vis && visita.fotos_vis.length) {
      visita.fotos_vis = visita.fotos_vis.map(function (f) {
        f.Loc_Foto = normalizarUrlDrive_(f.Loc_Foto);
        return f;
      });
    }
    return { sucesso: true, visita: visita };
  } catch (err) {
    return { sucesso: false, mensagem: 'Erro ao carregar visita: ' + err.message };
  }
}

/**
 * Converte URLs antigas do Google Drive para o formato novo compatível com <img>.
 * - Antigo: https://drive.google.com/uc?id=XXX
 * - Antigo: https://drive.google.com/open?id=XXX
 * - Antigo: https://drive.google.com/file/d/XXX/view
 * - Novo:   https://lh3.googleusercontent.com/d/XXX
 *
 * Se a URL já estiver no formato novo, retorna sem alterações.
 */
function normalizarUrlDrive_(url) {
  if (!url) return url;
  if (url.indexOf('lh3.googleusercontent.com/d/') > -1) return url;

  var id = null;
  // uc?id=XXX ou open?id=XXX
  var m1 = url.match(/[?&]id=([^&]+)/);
  if (m1) id = m1[1];
  // /file/d/XXX/view
  if (!id) {
    var m2 = url.match(/\/file\/d\/([^\/]+)/);
    if (m2) id = m2[1];
  }
  if (id) return 'https://lh3.googleusercontent.com/d/' + id;
  return url;
}

/**
 * Função administrativa (executar manualmente no editor):
 * percorre todos os registros de fotos_vis e converte URLs antigas
 * para o formato novo (lh3.googleusercontent.com). Use APENAS uma vez
 * para limpar o banco legado.
 *
 * @return {Object} { sucesso, atualizadas, total }
 */
function migrarLinksFotosDrive_() {
  try {
    var linhas = supabaseRequest_('fotos_vis?select=id_foto,Nome_Foto,Loc_Foto', 'GET');
    if (!linhas || !linhas.length) return { sucesso: true, atualizadas: 0, total: 0 };

    var atualizadas = 0;
    linhas.forEach(function (f) {
      if (!f.Loc_Foto) return;
      if (f.Loc_Foto.indexOf('lh3.googleusercontent.com/d/') > -1) return;
      var novaUrl = normalizarUrlDrive_(f.Loc_Foto);
      if (novaUrl === f.Loc_Foto) return;
      supabaseRequest_('fotos_vis?id_foto=eq.' + f.id_foto, 'PATCH', { Loc_Foto: novaUrl });
      atualizadas++;
    });

    return { sucesso: true, atualizadas: atualizadas, total: linhas.length };
  } catch (err) {
    return { sucesso: false, mensagem: 'Erro ao migrar: ' + err.message };
  }
}

// ==================================================================
// MÓDULO 3 — FOTOS (Drive + fotos_vis)
// ==================================================================

/**
 * Recebe uma foto já convertida para WebP (base64) do cliente,
 * salva no Google Drive e registra em fotos_vis.
 *
 * @param {number} idAd - ag_agenda_diaria.id_ad
 * @param {number} idClientes - usado apenas para nomear o arquivo
 * @param {string} base64Data - dataURL (data:image/webp;base64,....) ou base64 puro
 * @param {string} tipo - 'Fachada' | 'Antes' | 'Depois'
 * @param {number} [indice] - índice sequencial quando há múltiplas fotos do mesmo tipo
 */
function salvarFoto(idAd, idClientes, base64Data, tipo, indice) {
  try {
    var cfg = getConfig_();
    var folder = DriveApp.getFolderById(cfg.DRIVE_FOLDER_ID);

    var puro = base64Data.indexOf(',') > -1 ? base64Data.split(',')[1] : base64Data;
    var bytes = Utilities.base64Decode(puro);

    var timestamp = new Date().getTime();
    var sufixo = indice ? '_' + indice : '';
    var nomeArquivo = 'cliente' + idClientes + '_' + tipo + '_' + timestamp + sufixo + '.webp';

    var blob = Utilities.newBlob(bytes, 'image/webp', nomeArquivo);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    // Formato novo do Google Drive para embed direto em <img>:
    // lh3.googleusercontent.com retorna os bytes da imagem (não uma página HTML)
    var link = 'https://lh3.googleusercontent.com/d/' + fileId;

    supabaseRequest_('fotos_vis', 'POST', {
      id_vis: idAd,
      Nome_Foto: nomeArquivo,
      Tipo: tipo,
      Loc_Foto: link
    });

    return { sucesso: true, nome: nomeArquivo, link: link, fileId: fileId };
  } catch (err) {
    return { sucesso: false, mensagem: 'Erro ao salvar foto: ' + err.message };
  }
}

// ==================================================================
// MÓDULO 4 — ABIR ATENDIMENTO (Etapa 1 do fluxo)
// ==================================================================

/**
 * Inicia o atendimento:
 *  - Atualiza ag_agenda_diaria com status 'Em Atendimento',
 *    data_hora_atendimento_inicio = agora, latitude e longitude.
 *
 * Deve ser chamado DEPOIS de salvarFoto() para todas as fotos
 * do tipo 'Fachada' e 'Antes'.
 *
 * @param {number} idAd
 * @param {Object} dados - { latitude, longitude }
 */
function abrirAtendimento(idAd, dados) {
  try {
    if (!idAd) throw new Error('id_ad não informado.');

    var agora = Utilities.formatDate(new Date(), getTimeZone_(), "yyyy-MM-dd'T'HH:mm:ss");

    var payload = {
      status_atendimento: STATUS_EM_ATENDIMENTO,
      data_hora_atendimento_inicio: agora,
      latitude: dados && dados.latitude != null ? String(dados.latitude) : null,
      longitude: dados && dados.longitude != null ? String(dados.longitude) : null
    };

    supabaseRequest_('ag_agenda_diaria?id_ad=eq.' + idAd, 'PATCH', payload);
    return { sucesso: true };
  } catch (err) {
    return { sucesso: false, mensagem: 'Erro ao abrir atendimento: ' + err.message };
  }
}

// ==================================================================
// MÓDULO 5 — FECHA ATENDIMENTO (Etapa 2 do fluxo)
// ==================================================================

/**
 * Finaliza o atendimento:
 *  - Atualiza ag_agenda_diaria com status 'Pendente Auditoria',
 *    data_hora_atendimento_fim = agora e observação.
 *
 * Deve ser chamado DEPOIS de salvarFoto() para todas as fotos
 * do tipo 'Depois'.
 *
 * @param {number} idAd
 * @param {Object} dados - { observacao }
 */
function fecharAtendimento(idAd, dados) {
  try {
    if (!idAd) throw new Error('id_ad não informado.');

    var agora = Utilities.formatDate(new Date(), getTimeZone_(), "yyyy-MM-dd'T'HH:mm:ss");

    var observacao = (dados && dados.observacao || '').toString().slice(0, 300);

    var payload = {
      status_atendimento: STATUS_PENDENTE_AUDITORIA,
      data_hora_atendimento_fim: agora,
      observacao: observacao
    };

    supabaseRequest_('ag_agenda_diaria?id_ad=eq.' + idAd, 'PATCH', payload);
    return { sucesso: true };
  } catch (err) {
    return { sucesso: false, mensagem: 'Erro ao fechar atendimento: ' + err.message };
  }
}
