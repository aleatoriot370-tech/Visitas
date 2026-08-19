// ==================================================================
// APP DE ROTAS — GRUPO LAMOIA  (Netlify + Supabase + MEGA)
// ==================================================================

var API = '/api';  // proxied to /.netlify/functions by netlify.toml

var usuarioAtual = null;
var visitaAtual = null;
var geoAtual = { latitude: null, longitude: null };
var fotos = { fachada: [], antes: [], depois: [] };
var MAX_LADO_FOTO = 1200;

var STATUS_PENDENTE = 'Pendente';
var STATUS_EM_ATENDIMENTO = 'Em Atendimento';
var STATUS_PENDENTE_AUDITORIA = 'Pendente Auditoria';

// ==================================================================
// API HELPER
// ==================================================================
function api(path, opts) {
  return fetch(API + path, Object.assign({
    headers: { 'Content-Type': 'application/json' },
  }, opts))
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
}

function apiPost(path, body) {
  return api(path, { method: 'POST', body: JSON.stringify(body) });
}

// ==================================================================
// UI HELPERS
// ==================================================================
function mostrarTela(id) {
  ['tela-login', 'tela-lista', 'tela-form'].forEach(function (t) {
    document.getElementById(t).classList.toggle('hidden', t !== id);
  });
}

function toast(msg, tipo) {
  var el = document.createElement('div');
  el.className = 'toast' + (tipo ? ' ' + tipo : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 3200);
}

function mostrarOverlay(texto) {
  esconderOverlay();
  var ov = document.createElement('div');
  ov.className = 'overlay-carregando';
  ov.id = 'overlay-global';
  ov.innerHTML = '<div class="spinner"></div><div class="texto">' + texto + '</div>';
  document.body.appendChild(ov);
}
function esconderOverlay() {
  var ov = document.getElementById('overlay-global');
  if (ov) ov.remove();
}

// ==================================================================
// LOGIN
// ==================================================================
function fazerLogin() {
  var login = document.getElementById('input-login').value.trim();
  var senha = document.getElementById('input-senha').value;
  var erroEl = document.getElementById('login-erro');
  erroEl.classList.add('hidden');

  if (!login || !senha) {
    erroEl.textContent = 'Preencha login e senha.';
    erroEl.classList.remove('hidden');
    return;
  }

  var btn = document.getElementById('btn-entrar');
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  apiPost('/auth', { login: login, senha: senha })
    .then(function (res) {
      btn.disabled = false;
      btn.textContent = 'Entrar';
      if (!res.sucesso) {
        erroEl.textContent = res.mensagem;
        erroEl.classList.remove('hidden');
        return;
      }
      usuarioAtual = res.usuario;
      var nome = usuarioAtual.Nome || usuarioAtual.Login;
      document.getElementById('usuario-nome').textContent = nome;
      document.getElementById('usuario-nome-2').textContent = nome;
      document.getElementById('usuario-nome-3').textContent = nome;
      mostrarTela('tela-lista');
      carregarVisitas();
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Entrar';
      erroEl.textContent = 'Erro de conexão: ' + err.message;
      erroEl.classList.remove('hidden');
    });
}

function sair() {
  usuarioAtual = null;
  visitaAtual = null;
  document.getElementById('input-login').value = '';
  document.getElementById('input-senha').value = '';
  mostrarTela('tela-login');
}

// ==================================================================
// LISTA DE VISITAS
// ==================================================================
function carregarVisitas() {
  var carregando = document.getElementById('lista-carregando');
  var vazio = document.getElementById('lista-vazia');
  var cardsEl = document.getElementById('lista-cards');
  cardsEl.innerHTML = '';
  vazio.classList.add('hidden');
  carregando.classList.remove('hidden');

  api('/visitas?idVendedor=' + encodeURIComponent(usuarioAtual.id_user))
    .then(function (res) {
      carregando.classList.add('hidden');
      if (!res.sucesso) { toast(res.mensagem, 'erro'); return; }
      if (!res.visitas.length) { vazio.classList.remove('hidden'); return; }
      res.visitas.forEach(function (v) { cardsEl.appendChild(criarCard(v)); });
    })
    .catch(function (err) {
      carregando.classList.add('hidden');
      toast('Erro ao carregar visitas: ' + err.message, 'erro');
    });
}

function classeSelo(status) {
  if (!status) return 'selo-outro';
  var s = status.toLowerCase();
  if (s.indexOf('pendente auditoria') > -1) return 'selo-auditoria';
  if (s.indexOf('em atendimento') > -1) return 'selo-andamento';
  if (s.indexOf('pendente') > -1) return 'selo-pendente';
  if (s.indexOf('conclu') > -1 || s.indexOf('aprovad') > -1) return 'selo-concluido';
  return 'selo-outro';
}

function criarCard(v) {
  var div = document.createElement('div');
  div.className = 'card-visita';
  var razao = (v.Clientes && v.Clientes.Razao) || '—';
  var status = v.status_atendimento || STATUS_PENDENTE;
  div.innerHTML =
    '<div class="info">' +
      '<div class="codigo">Código ' + v.id_clientes + '</div>' +
      '<div class="razao">' + razao + '</div>' +
    '</div>' +
    '<div class="selo ' + classeSelo(status) + '">' + status + '</div>';
  div.onclick = function () { abrirVisita(v); };
  return div;
}

// ==================================================================
// FORMULÁRIO — 3 MODOS
// ==================================================================
function abrirVisita(v) {
  visitaAtual = v;
  fotos = { fachada: [], antes: [], depois: [] };
  geoAtual = { latitude: null, longitude: null };

  document.getElementById('fv-codigo').value = v.id_clientes;
  document.getElementById('fv-razao').value = (v.Clientes && v.Clientes.Razao) || '';
  var status = v.status_atendimento || STATUS_PENDENTE;
  document.getElementById('fv-status').value = status;
  document.getElementById('fv-observacao').value = '';
  document.getElementById('fv-inicio').value = '';
  document.getElementById('fv-fim').value = '';
  atualizarContador();

  ['fachada', 'antes', 'depois'].forEach(function (t) {
    document.getElementById('miniaturas-' + t).innerHTML = '';
  });

  document.getElementById('bloco-depois').classList.add('hidden');
  document.getElementById('bloco-observacao').classList.add('hidden');
  document.getElementById('bloco-datas').classList.add('hidden');
  document.getElementById('geo-salva').classList.add('hidden');
  document.getElementById('geo-status').classList.remove('hidden');
  document.getElementById('fv-observacao').removeAttribute('readonly');

  // Re-show upload areas
  var uploads = document.querySelectorAll('.upload-area');
  for (var i = 0; i < uploads.length; i++) uploads[i].classList.remove('hidden');

  mostrarTela('tela-form');

  if (status === STATUS_PENDENTE || !status) {
    configurarModoPendente();
  } else if (status === STATUS_EM_ATENDIMENTO) {
    carregarVisitaDetalhada(v.id_ad, configurarModoEmAtendimento);
  } else {
    carregarVisitaDetalhada(v.id_ad, configurarModoAuditoria);
  }
}

function carregarVisitaDetalhada(idAd, callback) {
  mostrarOverlay('Carregando dados da visita...');
  api('/get-visita?idAd=' + encodeURIComponent(idAd))
    .then(function (res) {
      esconderOverlay();
      if (!res.sucesso) { toast(res.mensagem, 'erro'); voltarParaLista(false); return; }
      visitaAtual = res.visita;
      callback(res.visita);
    })
    .catch(function (err) {
      esconderOverlay();
      toast('Erro ao carregar visita: ' + err.message, 'erro');
      voltarParaLista(false);
    });
}

// ---- MODO PENDENTE (Etapa 1) ----
function configurarModoPendente() {
  document.getElementById('form-titulo').textContent = 'Abrir Atendimento';
  document.getElementById('btn-salvar-visita').textContent = 'Abrir Atendimento';
  document.getElementById('btn-salvar-visita').onclick = abrirAtendimentoAction;
  document.getElementById('btn-salvar-visita').classList.remove('hidden');
  document.getElementById('btn-cancelar').textContent = 'Cancelar';
  document.getElementById('btn-cancelar').onclick = cancelarVisita;
  document.getElementById('btn-cancelar').classList.remove('hidden');
  document.getElementById('btn-voltar').onclick = function () { voltarParaLista(true); };
  obterGeolocalizacao();
}

// ---- MODO EM ATENDIMENTO (Etapa 2) ----
function configurarModoEmAtendimento(visita) {
  document.getElementById('form-titulo').textContent = 'Fecha Atendimento';

  document.getElementById('bloco-datas').classList.remove('hidden');
  document.getElementById('fv-inicio').value = formatarDataHora(visita.data_hora_atendimento_inicio);

  if (visita.latitude && visita.longitude) {
    document.getElementById('geo-status').classList.add('hidden');
    var geoSalva = document.getElementById('geo-salva');
    geoSalva.classList.remove('hidden');
    geoSalva.className = 'geo-salva geo-ok';
    geoSalva.textContent = 'Localização inicial capturada (' +
      Number(visita.latitude).toFixed(5) + ', ' + Number(visita.longitude).toFixed(5) + ')';
  }

  carregarFotosSalvas(visita, ['Fachada', 'Antes']);

  document.getElementById('upload-fachada-label').classList.add('hidden');
  document.getElementById('bloco-antes').querySelector('.upload-area').classList.add('hidden');

  document.getElementById('bloco-depois').classList.remove('hidden');
  document.getElementById('bloco-observacao').classList.remove('hidden');

  document.getElementById('btn-salvar-visita').textContent = 'Fecha Atendimento';
  document.getElementById('btn-salvar-visita').onclick = fecharAtendimentoAction;
  document.getElementById('btn-salvar-visita').classList.remove('hidden');
  document.getElementById('btn-cancelar').textContent = 'Cancelar';
  document.getElementById('btn-cancelar').onclick = cancelarVisita;
  document.getElementById('btn-cancelar').classList.remove('hidden');
  document.getElementById('btn-voltar').onclick = function () { voltarParaLista(true); };
}

// ---- MODO AUDITORIA (somente leitura) ----
function configurarModoAuditoria(visita) {
  document.getElementById('form-titulo').textContent = 'Visita Concluída — Auditoria';

  document.getElementById('bloco-datas').classList.remove('hidden');
  document.getElementById('fv-inicio').value = formatarDataHora(visita.data_hora_atendimento_inicio);
  document.getElementById('fv-fim').value = formatarDataHora(visita.data_hora_atendimento_fim);

  if (visita.latitude && visita.longitude) {
    document.getElementById('geo-status').classList.add('hidden');
    var geoSalva = document.getElementById('geo-salva');
    geoSalva.classList.remove('hidden');
    geoSalva.className = 'geo-salva geo-ok';
    geoSalva.textContent = 'Localização capturada (' +
      Number(visita.latitude).toFixed(5) + ', ' + Number(visita.longitude).toFixed(5) + ')';
  }

  carregarFotosSalvas(visita, ['Fachada', 'Antes', 'Depois']);

  document.getElementById('bloco-depois').classList.remove('hidden');
  document.getElementById('bloco-observacao').classList.remove('hidden');
  document.getElementById('fv-observacao').value = visita.observacao || '';
  atualizarContador();

  var uploads = document.querySelectorAll('.upload-area');
  for (var i = 0; i < uploads.length; i++) uploads[i].classList.add('hidden');
  document.getElementById('fv-observacao').setAttribute('readonly', 'readonly');

  document.getElementById('btn-salvar-visita').classList.add('hidden');
  document.getElementById('btn-cancelar').textContent = 'Voltar';
  document.getElementById('btn-cancelar').onclick = function () { voltarParaLista(false); };
  document.getElementById('btn-cancelar').classList.remove('hidden');
  document.getElementById('btn-voltar').onclick = function () { voltarParaLista(false); };
}

// ---- Fotos salvas ----
function carregarFotosSalvas(visita, tipos) {
  if (!visita.fotos_vis) return;
  visita.fotos_vis.forEach(function (f) {
    if (tipos.indexOf(f.Tipo) === -1) return;
    var chave = f.Tipo.toLowerCase();
    var container = document.getElementById('miniaturas-' + chave);
    if (!container) return;

    var item = { dataUrl: f.Loc_Foto, nome: f.Nome_Foto, salva: true };
    fotos[chave].push(item);

    var div = document.createElement('div');
    div.className = 'miniatura';
    var img = document.createElement('img');
    img.alt = f.Nome_Foto || '';
    aplicarUrlComFallback(img, f.Loc_Foto);
    div.appendChild(img);
    container.appendChild(div);
  });
}

function aplicarUrlComFallback(imgEl, urlOriginal) {
  // Base64 data URL — funciona direto, sem fallback
  if (urlOriginal && urlOriginal.indexOf('data:image') === 0) {
    imgEl.src = urlOriginal;
    return;
  }

  // URLs externas (MEGA, Drive, etc.) — tenta com fallback
  var candidatos = gerarUrlsAlternativas(urlOriginal);
  var tentativa = 0;

  imgEl.addEventListener('error', function () {
    tentativa++;
    if (tentativa < candidatos.length) {
      imgEl.src = candidatos[tentativa];
    } else {
      imgEl.removeAttribute('src');
      imgEl.parentElement.classList.add('miniatura-erro-container');
      imgEl.parentElement.innerHTML =
        '<div class="miniatura-erro-info">📷<br><small>(não carregou)</small></div>';
    }
  });

  imgEl.src = candidatos[0];
}

function gerarUrlsAlternativas(url) {
  if (!url) return [];
  // Base64 — não precisa de alternativas
  if (url.indexOf('data:') === 0) return [url];

  // MEGA link — usa proxy local que baixa, descriptografa e serve
  var megaMatch = url.match(/mega\.nz\/file\/([a-zA-Z0-9_-]+)#([a-zA-Z0-9_-]+)/);
  if (megaMatch) {
    return [API + '/mega-proxy?id=' + encodeURIComponent(megaMatch[1]) + '&k=' + encodeURIComponent(megaMatch[2])];
  }
  // MEGA old format
  var megaOld = url.match(/mega\.nz\/#!([a-zA-Z0-9_-]+)!([a-zA-Z0-9_-]+)/);
  if (megaOld) {
    return [API + '/mega-proxy?id=' + encodeURIComponent(megaOld[1]) + '&k=' + encodeURIComponent(megaOld[2])];
  }

  var urls = [url];

  // Google Drive — gera URLs alternativas
  var id = null;
  var m1 = url.match(/[?&]id=([^&]+)/);
  if (m1) id = m1[1];
  if (!id) { var m2 = url.match(/\/file\/d\/([^\/]+)/); if (m2) id = m2[1]; }
  if (!id) { var m3 = url.match(/\/d\/([^\/]+)/); if (m3) id = m3[1]; }

  if (id) {
    var lh3 = 'https://lh3.googleusercontent.com/d/' + id;
    var uc = 'https://drive.google.com/uc?id=' + id;
    var thumb = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w400-h400';
    if (urls.indexOf(lh3) === -1) urls.push(lh3);
    if (urls.indexOf(uc) === -1) urls.push(uc);
    if (urls.indexOf(thumb) === -1) urls.push(thumb);
  }
  return urls;
}

function formatarDataHora(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts.replace(' ', 'T'));
    if (isNaN(d.getTime())) return ts;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch (e) { return ts; }
}

// ==================================================================
// NAVEGAÇÃO
// ==================================================================
function voltarParaLista(perguntar) {
  var temAlteracoes = fotos.fachada.some(function (f) { return !f.salva; }) ||
    fotos.antes.some(function (f) { return !f.salva; }) ||
    fotos.depois.some(function (f) { return !f.salva; }) ||
    document.getElementById('fv-observacao').value.trim().length > 0;
  if (perguntar && temAlteracoes) {
    if (!confirm('Tem certeza que deseja sair? As informações preenchidas serão perdidas.')) return;
  }
  visitaAtual = null;
  mostrarTela('tela-lista');
  carregarVisitas();
}

function cancelarVisita() {
  if (!confirm('Tem certeza que deseja cancelar? As informações preenchidas serão perdidas.')) return;
  voltarParaLista(false);
}

function atualizarContador() {
  var el = document.getElementById('fv-observacao');
  if (el) document.getElementById('contador-obs').textContent = el.value.length;
}

// ==================================================================
// GEOLOCALIZAÇÃO
// ==================================================================
function obterGeolocalizacao() {
  var statusEl = document.getElementById('geo-status');
  statusEl.className = 'geo-status geo-pendente';
  statusEl.textContent = 'Obtendo localização do aparelho...';
  statusEl.classList.remove('hidden');
  document.getElementById('geo-salva').classList.add('hidden');

  if (!navigator.geolocation) {
    statusEl.className = 'geo-status geo-erro';
    statusEl.textContent = 'Geolocalização não suportada neste navegador.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (pos) {
      geoAtual.latitude = pos.coords.latitude;
      geoAtual.longitude = pos.coords.longitude;
      statusEl.className = 'geo-status geo-ok';
      statusEl.textContent = 'Localização capturada (' + pos.coords.latitude.toFixed(5) + ', ' + pos.coords.longitude.toFixed(5) + ')';
    },
    function (err) {
      statusEl.className = 'geo-status geo-erro';
      statusEl.textContent = 'Não foi possível obter a localização: ' + err.message + '. Verifique as permissões do navegador.';
    },
    { enableHighAccuracy: true, timeout: 12000 }
  );
}

// ==================================================================
// FOTOS — REDIMENSIONAR + WEBP
// ==================================================================
function redimensionarEConverterParaWebp(file, maxLado) {
  return new Promise(function (resolve, reject) {
    var leitor = new FileReader();
    leitor.onerror = function () { reject(new Error('Falha ao ler o arquivo de imagem.')); };
    leitor.onload = function (e) {
      var img = new Image();
      img.onerror = function () { reject(new Error('Falha ao processar a imagem.')); };
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > maxLado || h > maxLado) {
          if (w >= h) { h = Math.round(h * (maxLado / w)); w = maxLado; }
          else { w = Math.round(w * (maxLado / h)); h = maxLado; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);

        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Este navegador não suporta conversão para WebP.')); return; }
          var leitorBlob = new FileReader();
          leitorBlob.onload = function () { resolve(leitorBlob.result); };
          leitorBlob.onerror = function () { reject(new Error('Falha ao gerar dataURL.')); };
          leitorBlob.readAsDataURL(blob);
        }, 'image/webp', 0.82);
      };
      img.src = e.target.result;
    };
    leitor.readAsDataURL(file);
  });
}

// ==================================================================
// CÂMERA — abre via MediaDevices API (funciona em todos os Androids)
// ==================================================================
var cameraStream = null;
var cameraTipoAtual = null;

function abrirCamera(tipo) {
  cameraTipoAtual = tipo;
  var modal = document.getElementById('camera-modal');
  var video = document.getElementById('camera-video');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    // Fallback: se não tem MediaDevices, abre galeria
    abrirGaleria(tipo);
    return;
  }

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false
  })
    .then(function (stream) {
      cameraStream = stream;
      video.srcObject = stream;
      modal.classList.remove('hidden');
    })
    .catch(function (err) {
      console.warn('Câmera não disponível, abrindo galeria:', err.message);
      abrirGaleria(tipo);
    });
}

function capturarFoto() {
  var video = document.getElementById('camera-video');
  var canvas = document.getElementById('camera-canvas');
  var ctx = canvas.getContext('2d');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  canvas.toBlob(function (blob) {
    if (!blob) { toast('Erro ao capturar foto.', 'erro'); return; }

    // Converte blob para File
    var file = new File([blob], 'foto_' + Date.now() + '.jpg', { type: 'image/jpeg' });

    // Processa como se viesse do input
    processarArquivo(file, cameraTipoAtual);

    fecharCamera();
  }, 'image/jpeg', 0.9);
}

function fecharCamera() {
  var modal = document.getElementById('camera-modal');
  modal.classList.add('hidden');

  if (cameraStream) {
    cameraStream.getTracks().forEach(function (track) { track.stop(); });
    cameraStream = null;
  }
}

function abrirGaleria(tipo) {
  var input = document.getElementById('input-galeria-' + tipo);
  if (input) input.click();
}

// Click na area de upload abre a camera
(function () {
  var areas = document.querySelectorAll('.upload-area');
  areas.forEach(function (area) {
    area.addEventListener('click', function (e) {
      // Ignora clique no botao de galeria
      if (e.target.classList.contains('btn-galeria')) return;

      // Descobre qual tipo baseado no bloco pai
      var bloco = area.closest('.bloco');
      if (!bloco) return;
      var tipo = null;
      if (bloco.contains(document.getElementById('miniaturas-fachada'))) tipo = 'fachada';
      else if (bloco.contains(document.getElementById('miniaturas-antes'))) tipo = 'antes';
      else if (bloco.contains(document.getElementById('miniaturas-depois'))) tipo = 'depois';

      if (tipo) abrirCamera(tipo);
    });
  });
})();

function processarArquivo(file, tipo) {
  if (tipo === 'fachada') {
    var pendentes = fotos.fachada.filter(function (f) { return !f.salva; });
    if (pendentes.length >= 1) {
      fotos.fachada = fotos.fachada.filter(function (f) { return f.salva; });
    }
    document.getElementById('miniaturas-fachada').innerHTML = '';
    fotos.fachada.forEach(function (item) {
      var c = document.getElementById('miniaturas-fachada');
      var d = document.createElement('div');
      d.className = 'miniatura';
      var im = document.createElement('img');
      im.src = item.dataUrl;
      c.appendChild(d).appendChild(im);
    });
  }

  var container = document.getElementById('miniaturas-' + tipo);
  var placeholder = document.createElement('div');
  placeholder.className = 'miniatura';
  placeholder.innerHTML = '<div class="processando">Processando...</div>';
  container.appendChild(placeholder);

  redimensionarEConverterParaWebp(file, MAX_LADO_FOTO)
    .then(function (dataUrl) {
      var item = { dataUrl: dataUrl };
      fotos[tipo].push(item);

      placeholder.innerHTML = '';
      var img = document.createElement('img');
      img.src = dataUrl;
      placeholder.appendChild(img);

      var btnRemover = document.createElement('button');
      btnRemover.className = 'remover';
      btnRemover.textContent = '×';
      btnRemover.onclick = function (ev) {
        ev.stopPropagation();
        var idx = fotos[tipo].indexOf(item);
        if (idx > -1) fotos[tipo].splice(idx, 1);
        placeholder.remove();
      };
      placeholder.appendChild(btnRemover);
    })
    .catch(function (err) {
      placeholder.remove();
      toast('Erro ao processar foto: ' + err.message, 'erro');
    });
}

function tratarSelecaoFoto(event, tipo) {
  var arquivos = Array.prototype.slice.call(event.target.files || []);
  if (!arquivos.length) return;

  arquivos.forEach(function (file) {
    processarArquivo(file, tipo);
  });

  event.target.value = '';
}

// ==================================================================
// AÇÃO: ABRIR ATENDIMENTO (Etapa 1)
// ==================================================================
function abrirAtendimentoAction() {
  var novasFachada = fotos.fachada.filter(function (f) { return !f.salva; });
  var novasAntes = fotos.antes.filter(function (f) { return !f.salva; });

  if (!novasFachada.length) { toast('Adicione a foto da fachada.', 'erro'); return; }
  if (!novasAntes.length) { toast('Adicione ao menos uma foto ANTES.', 'erro'); return; }
  if (geoAtual.latitude === null) {
    toast('Aguardando localização. Tente novamente em instantes.', 'erro');
    obterGeolocalizacao();
    return;
  }

  var idAd = visitaAtual.id_ad;
  var idClientes = visitaAtual.id_clientes;

  var filasFotos = [];
  novasFachada.forEach(function (item, i) {
    filasFotos.push({ tipo: 'Fachada', dataUrl: item.dataUrl, indice: novasFachada.length > 1 ? i + 1 : null });
  });
  novasAntes.forEach(function (item, i) {
    filasFotos.push({ tipo: 'Antes', dataUrl: item.dataUrl, indice: novasAntes.length > 1 ? i + 1 : null });
  });

  mostrarOverlay('Enviando fotos (0/' + filasFotos.length + ')...');

  salvarFotosSequencial(filasFotos, 0, idAd, idClientes, function (erro) {
    if (erro) { esconderOverlay(); toast('Erro ao enviar fotos: ' + erro, 'erro'); return; }
    mostrarOverlay('Abrindo atendimento...');
    apiPost('/abrir-atendimento', {
      idAd: idAd,
      latitude: geoAtual.latitude,
      longitude: geoAtual.longitude,
      acao: 'abrir'
    })
      .then(function (res) {
        esconderOverlay();
        if (!res.sucesso) { toast(res.mensagem, 'erro'); return; }
        toast('Atendimento iniciado com sucesso!', 'sucesso');
        voltarParaLista(false);
      })
      .catch(function (err) {
        esconderOverlay();
        toast('Erro ao abrir atendimento: ' + err.message, 'erro');
      });
  });
}

// ==================================================================
// AÇÃO: FECHAR ATENDIMENTO (Etapa 2)
// ==================================================================
function fecharAtendimentoAction() {
  var novasDepois = fotos.depois.filter(function (f) { return !f.salva; });
  if (!novasDepois.length) { toast('Adicione ao menos uma foto DEPOIS.', 'erro'); return; }

  var idAd = visitaAtual.id_ad;
  var idClientes = visitaAtual.id_clientes;
  var observacao = document.getElementById('fv-observacao').value.slice(0, 300);

  var filasFotos = [];
  novasDepois.forEach(function (item, i) {
    filasFotos.push({ tipo: 'Depois', dataUrl: item.dataUrl, indice: novasDepois.length > 1 ? i + 1 : null });
  });

  mostrarOverlay('Enviando fotos (0/' + filasFotos.length + ')...');

  salvarFotosSequencial(filasFotos, 0, idAd, idClientes, function (erro) {
    if (erro) { esconderOverlay(); toast('Erro ao enviar fotos: ' + erro, 'erro'); return; }
    mostrarOverlay('Fechando atendimento...');
    apiPost('/abrir-atendimento', {
      idAd: idAd,
      observacao: observacao,
      acao: 'fechar'
    })
      .then(function (res) {
        esconderOverlay();
        if (!res.sucesso) { toast(res.mensagem, 'erro'); return; }
        toast('Atendimento finalizado com sucesso!', 'sucesso');
        voltarParaLista(false);
      })
      .catch(function (err) {
        esconderOverlay();
        toast('Erro ao fechar atendimento: ' + err.message, 'erro');
      });
  });
}

// ==================================================================
// UPLOAD SEQUENCIAL DE FOTOS
// ==================================================================
function salvarFotosSequencial(fila, i, idAd, idClientes, callback) {
  if (i >= fila.length) { callback(null); return; }
  var item = fila[i];
  mostrarOverlay('Enviando fotos (' + (i + 1) + '/' + fila.length + ')...');

  apiPost('/upload-photo', {
    idAd: idAd,
    idClientes: idClientes,
    base64Data: item.dataUrl,
    tipo: item.tipo,
    indice: item.indice
  })
    .then(function (res) {
      if (!res.sucesso) { callback(res.mensagem); return; }
      salvarFotosSequencial(fila, i + 1, idAd, idClientes, callback);
    })
    .catch(function (err) {
      callback(err.message);
    });
}
