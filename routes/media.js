const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { checkRateLimit } = require('../middleware/rateLimit');

const STORAGE = process.env.STORAGE_PATH || path.join(__dirname, '../storage');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3594';
const MAX_SIZE = parseInt(process.env.MAX_IMAGE_SIZE) || 5 * 1024 * 1024;   // 5 MB input cap
const MAX_IMAGES_PER_ARTICLE = 20;

// ── Compression settings ─────────────────────────────────────────────────
const COMPRESS_THRESHOLD = parseInt(process.env.COMPRESS_THRESHOLD) || 500 * 1024; // 500 KB
const INITIAL_QUALITY    = parseFloat(process.env.WEBP_QUALITY)  || 0.82;           // 0–1
const MIN_QUALITY        = 0.40;   // absolute floor
const QUALITY_STEP       = 0.08;   // reduction per iteration
const MAX_DIMENSION      = 1920;   // px — longest side cap
// ────────────────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes JPEG, PNG, GIF y WebP'));
  }
});

/**
 * Compress a file buffer to WebP, respecting the 500 KB threshold.
 * If the buffer is already under threshold and already WebP, skips re-encode.
 * Otherwise: resize → encode → iteratively reduce quality until under threshold.
 *
 * @param {Buffer} buffer      Raw image buffer
 * @param {string} mimetype    Original MIME type
 * @returns {Promise<{buffer: Buffer, quality: number, skipped: boolean}>}
 */
async function compressToWebP(buffer, mimetype) {
  const meta = await sharp(buffer).metadata();

  // Calculate scaled dimensions
  let { width, height } = meta;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      height = Math.round(height * MAX_DIMENSION / width);
      width  = MAX_DIMENSION;
    } else {
      width  = Math.round(width * MAX_DIMENSION / height);
      height = MAX_DIMENSION;
    }
  }

  let quality = INITIAL_QUALITY;
  let outBuf;

  // First pass
  outBuf = await sharp(buffer)
    .resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: Math.round(quality * 100), effort: 4 })
    .toBuffer();

  // Iterative reduction if still over threshold
  while (outBuf.length > COMPRESS_THRESHOLD && quality > MIN_QUALITY) {
    quality = Math.max(quality - QUALITY_STEP, MIN_QUALITY);
    outBuf = await sharp(buffer)
      .resize({ width, height, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: Math.round(quality * 100), effort: 4 })
      .toBuffer();
  }

  // Safety: if compression somehow made it larger, return original quality
  if (outBuf.length > buffer.length && mimetype === 'image/webp') {
    return { buffer: buffer, quality: INITIAL_QUALITY, skipped: true };
  }

  return { buffer: outBuf, quality, skipped: false };
}

// POST /api/media/upload
router.post('/upload', requireAuth, checkRateLimit('upload_image'), upload.array('images', 5), async (req, res) => {
  try {
    const articleId = req.body.articleId ? parseInt(req.body.articleId) : null;

    if (!req.files || !req.files.length)
      return res.status(400).json({ error: 'No se recibieron imágenes' });

    // Check image limit per article if articleId provided
    if (articleId) {
      const [[{ count }]] = await db.query(
        'SELECT COUNT(*) AS count FROM eu_media WHERE article_id = ?',
        [articleId]
      );
      if (count >= MAX_IMAGES_PER_ARTICLE) {
        return res.status(400).json({ 
          error: `Límite de ${MAX_IMAGES_PER_ARTICLE} imágenes alcanzado para este artículo` 
        });
      }
      // Check if adding new images would exceed limit
      if (count + req.files.length > MAX_IMAGES_PER_ARTICLE) {
        return res.status(400).json({ 
          error: `Solo puedes subir ${MAX_IMAGES_PER_ARTICLE - count} imagen(es) más. Límite: ${MAX_IMAGES_PER_ARTICLE}` 
        });
      }
    }

    const results = [];

    for (const file of req.files) {
      const filename = `${uuidv4()}.webp`;
      const dir = path.join(STORAGE, 'images', articleId ? String(articleId) : 'temp');
      await fs.mkdir(dir, { recursive: true });

      const filePath = path.join(dir, filename);

      // ── Backend compression (with 500 KB threshold + iterative reduction) ──
      const { buffer: compressedBuffer, quality: usedQuality } =
        await compressToWebP(file.buffer, file.mimetype);

      await fs.writeFile(filePath, compressedBuffer);

      // Read final dimensions from compressed output
      const finalMeta = await sharp(compressedBuffer).metadata();
      const finalSize = compressedBuffer.length;

      const sizeSaved = file.size - finalSize;
      if (sizeSaved > 0) {
        console.log(
          `[media] ${file.originalname}: ${(file.size/1024).toFixed(0)} KB → ` +
          `${(finalSize/1024).toFixed(0)} KB (q=${Math.round(usedQuality*100)}, ` +
          `-${Math.round(sizeSaved/file.size*100)}%)`
        );
      }

      const publicUrl = `${BASE_URL}/media/${articleId || 'temp'}/${filename}`;

      const [result] = await db.query(
        `INSERT INTO eu_media (article_id, uploader_id, filename, original_name, mime_type, size_bytes, width, height, file_path, public_url, file_size)
         VALUES (?, ?, ?, ?, 'image/webp', ?, ?, ?, ?, ?, ?)`,
        [articleId, req.user.id, filename, file.originalname, finalSize,
         finalMeta.width || 0, finalMeta.height || 0, filePath, publicUrl, finalSize]
      );

      results.push({
        id: result.insertId,
        filename,
        publicUrl,
        shortcode: `[image src="${publicUrl}" alt="${file.originalname.replace(/\.[^.]+$/, '')}"]`
      });
    }

    res.json({ message: 'Imágenes subidas exitosamente', files: results });
  } catch (err) {
    console.error('Error subiendo imagen:', err);
    if (err.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: `La imagen supera el límite de ${MAX_SIZE / 1024 / 1024} MB. El servidor la comprimirá si está por encima de ${COMPRESS_THRESHOLD / 1024} KB, pero el archivo original no puede superar el límite de carga.` });
    res.status(500).json({ error: err.message || 'Error al subir imagen' });
  }
});

// GET /api/media/article/:articleId - Imágenes de un artículo
router.get('/article/:articleId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, filename, public_url, width, height, created_at FROM eu_media WHERE article_id = ?',
      [req.params.articleId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener imágenes' });
  }
});

// DELETE /api/media/:mediaId - Delete an image
router.delete('/:mediaId', requireAuth, async (req, res) => {
  try {
    const mediaId = parseInt(req.params.mediaId);
    if (!mediaId) return res.status(400).json({ error: 'ID inválido' });

    const [[row]] = await db.query(
      'SELECT * FROM eu_media WHERE id = ?', [mediaId]
    );
    if (!row) return res.status(404).json({ error: 'Imagen no encontrada' });

    // Permission: uploader or mod/admin
    const isMod = ['MOD', 'ADMIN'].includes(req.user.role);
    if (row.uploader_id !== req.user.id && !isMod) {
      return res.status(403).json({ error: 'Sin permiso para eliminar esta imagen' });
    }

    // Delete file from disk
    try { await fs.unlink(row.file_path); } catch (e) { /* file may already be gone */ }

    // Delete from DB
    await db.query('DELETE FROM eu_media WHERE id = ?', [mediaId]);

    res.json({ message: 'Imagen eliminada' });
  } catch (err) {
    console.error('DELETE /media/:id error:', err);
    res.status(500).json({ error: 'Error al eliminar imagen' });
  }
});

// Servir archivos estáticos (para cuando no hay CDN)
// En producción, configura nginx para /media
router.get('/:articleId/:filename', async (req, res) => {
  try {
    const { articleId, filename } = req.params;
    if (!/^[a-z0-9-]+\.webp$/.test(filename))
      return res.status(400).json({ error: 'Archivo inválido' });

    const filePath = path.join(STORAGE, 'images', articleId, filename);
    res.sendFile(filePath);
  } catch (err) {
    res.status(404).json({ error: 'Imagen no encontrada' });
  }
});

module.exports = router;
