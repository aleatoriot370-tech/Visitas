/**
 * Servidor de teste local — emula Netlify Functions + static files.
 * Uso: node server.js  (ou: npm run dev)
 *
 * Requer .env com as variáveis de ambiente (veja .env.example).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Carrega .env se existir
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(function (line) {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx > -1) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const PORT = process.env.PORT || 8888;
const STATIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Carrega as functions
const FUNCTIONS_DIR = path.join(__dirname, 'netlify', 'functions');
const functions = {};

fs.readdirSync(FUNCTIONS_DIR).forEach(function (file) {
  if (file.endsWith('.js')) {
    const name = file.replace('.js', '');
    functions[name] = require(path.join(FUNCTIONS_DIR, file));
  }
});

console.log('Functions carregadas:', Object.keys(functions).join(', '));

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // API routes → Netlify Functions
  if (pathname.startsWith('/api/')) {
    const funcName = pathname.replace('/api/', '').replace(/\/$/, '');
    const func = functions[funcName];

    if (!func || !func.handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Function not found: ' + funcName }));
      return;
    }

    // Lê body para POST
    let body = '';
    if (req.method === 'POST' || req.method === 'PUT') {
      body = await new Promise(function (resolve) {
        let data = '';
        req.on('data', function (chunk) { data += chunk; });
        req.on('end', function () { resolve(data); });
      });
    }

    // Simula o event do Netlify
    const event = {
      httpMethod: req.method,
      path: pathname,
      queryStringParameters: parsed.query || {},
      headers: req.headers || {},
      body: body || null,
    };

    try {
      const result = await func.handler(event);
      const headers = Object.assign({ 'Content-Type': 'application/json' }, result.headers || {});
      res.writeHead(result.statusCode || 200, headers);
      res.end(result.body || '');
    } catch (err) {
      console.error('Function error:', funcName, err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sucesso: false, mensagem: err.message }));
    }
    return;
  }

  // Static files
  let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!fs.existsSync(filePath)) {
    // SPA fallback
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, function () {
  console.log('\n========================================');
  console.log('  Grupo Lamoia — Teste Local');
  console.log('  http://localhost:' + PORT);
  console.log('========================================\n');
});
