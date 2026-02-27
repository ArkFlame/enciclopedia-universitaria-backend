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
const MAX_SIZE = parseInt(process.env.MAX_IMAGE_SIZE) || 5 * 1024 * 1024; // 5MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes JPEG, PNG, GIF y WebP'));
  }
});

// POST /api/media/upload
router.post('/upload', requireAuth, checkRateLimit('upload_image'), upload.array('images', 5), async (req, res) => {
  try {
    const articleId = req.body.articleId ? parseInt(req.body.articleId) : null;

    if (!req.files || !req.files.length)
      return res.status(400).json({ error: 'No se recibieron imágenes' });

    const results = [];

    for (const file of req.files) {
      const filename = `${uuidv4()}.webp`;
      const dir = path.join(STORAGE, 'images', articleId ? String(articleId) : 'temp');
      await fs.mkdir(dir, { recursive: true });

      const filePath = path.join(dir, filename);

      // Comprimir y convertir a WebP
      const metadata = await sharp(file.buffer).metadata();
      await sharp(file.buffer)
        .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(filePath);

      const stat = await fs.stat(filePath);
      const publicUrl = `${BASE_URL}/media/${articleId || 'temp'}/${filename}`;

      const [result] = await db.query(
        `INSERT INTO eu_media (article_id, uploader_id, filename, original_name, mime_type, size_bytes, width, height, file_path, public_url)
         VALUES (?, ?, ?, ?, 'image/webp', ?, ?, ?, ?, ?)`,
        [articleId, req.user.id, filename, file.originalname, stat.size,
         metadata.width, metadata.height, filePath, publicUrl]
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
      return res.status(400).json({ error: `La imagen supera el límite de ${MAX_SIZE / 1024 / 1024}MB` });
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
