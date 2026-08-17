/**
 * MEGA upload helper — caches login across warm invocations.
 *
 * Requires env vars: MEGA_EMAIL, MEGA_PASSWORD
 */

const { Storage } = require('megajs');

let _storage = null;
let _ready = null;

const MEGA_EMAIL    = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;

if (!MEGA_EMAIL || !MEGA_PASSWORD) {
  throw new Error('Missing MEGA_EMAIL or MEGA_PASSWORD env vars');
}

/**
 * Returns a logged-in mega Storage instance (reuses connection on warm starts).
 */
function getStorage() {
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
      reject(err);
    });
  });

  return _ready;
}

/**
 * Upload a Buffer to MEGA and return the public link.
 *
 * @param {Buffer}  buffer
 * @param {string}  filename
 * @returns {Promise<{link: string, nodeId: string}>}
 */
async function uploadToMega(buffer, filename) {
  const storage = await getStorage();
  const root = storage.root;

  return new Promise((resolve, reject) => {
    const uploadStream = root.upload({ name: filename, size: buffer.length });

    uploadStream.on('complete', (file) => {
      try {
        const link = file.link();
        resolve({ link, nodeId: file.nodeId || file.h });
      } catch (e) {
        reject(new Error('Upload complete but failed to generate link: ' + e.message));
      }
    });

    uploadStream.on('error', (err) => {
      reject(new Error('MEGA upload error: ' + err.message));
    });

    uploadStream.end(buffer);
  });
}

module.exports = { uploadToMega };
