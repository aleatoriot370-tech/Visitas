/**
 * MEGA upload helper — caches login across warm invocations.
 *
 * Env vars:
 *   MEGA_EMAIL     — e-mail da conta MEGA
 *   MEGA_PASSWORD  — senha da conta MEGA
 *   MEGA_FOLDER    — (opcional) nome da pasta onde salvar as fotos
 */

const { Storage } = require('megajs');

let _storage = null;
let _ready = null;
let _targetFolder = null;

const MEGA_EMAIL    = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;
const MEGA_FOLDER   = process.env.MEGA_FOLDER || null; // null = raiz

function checkMegaEnv() {
  if (!MEGA_EMAIL || !MEGA_PASSWORD) {
    throw new Error('Missing MEGA_EMAIL or MEGA_PASSWORD env vars');
  }
}

/**
 * Returns a logged-in mega Storage instance (reuses connection on warm starts).
 */
function getStorage() {
  checkMegaEnv();
  if (_storage && _ready) return _ready;

  _ready = new Promise((resolve, reject) => {
    const storage = new Storage({
      email: MEGA_EMAIL,
      password: MEGA_PASSWORD,
      keepalive: true,
    });

    storage.on('ready', () => {
      _storage = storage;
      resolve(storage);
    });

    storage.on('error', (err) => {
      _storage = null;
      _ready = null;
      _targetFolder = null;
      reject(err);
    });
  });

  return _ready;
}

/**
 * Encontra ou cria a pasta configurada em MEGA_FOLDER.
 * Se MEGA_FOLDER não estiver definido, retorna a raiz.
 */
async function getTargetFolder(storage) {
  if (!MEGA_FOLDER) return storage.root;

  if (_targetFolder) return _targetFolder;

  // Procura a pasta existente
  const root = storage.root;
  const children = root.children || [];

  let folder = children.find(
    (c) => c.name === MEGA_FOLDER && c.directory
  );

  if (!folder) {
    // Cria a pasta se não existir
    folder = await new Promise((resolve, reject) => {
      root.mkdir(MEGA_FOLDER, (err, dir) => {
        if (err) reject(new Error('Erro ao criar pasta MEGA: ' + err.message));
        else resolve(dir);
      });
    });
  }

  _targetFolder = folder;
  return folder;
}

/**
 * Upload a Buffer to MEGA and return the public link.
 *
 * @param {Buffer}  buffer
 * @param {string}  filename
 * @returns {Promise<{link: string}>}
 */
async function uploadToMega(buffer, filename) {
  const storage = await getStorage();
  const folder = await getTargetFolder(storage);

  return new Promise((resolve, reject) => {
    const uploadStream = folder.upload({ name: filename, size: buffer.length });

    uploadStream.on('complete', (file) => {
      try {
        const link = file.link();
        resolve({ link });
      } catch (e) {
        reject(new Error('Upload completo mas falhou ao gerar link: ' + e.message));
      }
    });

    uploadStream.on('error', (err) => {
      reject(new Error('Erro no upload MEGA: ' + err.message));
    });

    uploadStream.end(buffer);
  });
}

module.exports = { uploadToMega };
