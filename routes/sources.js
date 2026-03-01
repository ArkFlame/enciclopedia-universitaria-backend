/**
 * SOURCES ROUTES - Enciclopedia Universitaria
 * Handles article sources (links and PDFs)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { checkRateLimit } = require('../middleware/rateLimit');
const { getFaviconUrl, isValidUrl, getDomain } = require('../utils/favicon');

const STORAGE = process.env.STORAGE_PATH || path.join(__dirname, '../storage');
const MAX_PDF_SIZE = parseInt(process.env.MAX_PDF_SIZE) || 10 * 1024 * 1024; // 10MB
const MAX_PDFS_PER_ARTICLE = 5;
const MAX_LINKS_PER_ARTICLE = 20;
const MAX_TOTAL_SOURCES = parseInt(process.env.MAX_SOURCES_PER_ARTICLE) || 25;

// ============================================================
// Helper: Get current source counts for an article
// ============================================================
async function getSourceCounts(articleId) {
  const [[{ links, pdfs }]] = await db.query(
    `SELECT 
      COALESCE(SUM(CASE WHEN type = 'link' THEN 1 ELSE 0 END), 0) AS links,
      COALESCE(SUM(CASE WHEN type = 'pdf' THEN 1 ELSE 0 END), 0) AS pdfs
     FROM eu_article_sources WHERE article_id = ?`,
    [articleId]
  );
  const safeLinks = links || 0;
  const safePdfs = pdfs || 0;
  return { links: safeLinks, pdfs: safePdfs, total: safeLinks + safePdfs };
}

// ============================================================
// Helper: Download PDF source (external router mounts at /api/sources/pdf/:sourceId)
// ============================================================
async function downloadPdf(req, res) {
  try {
    const sourceId = parseInt(req.params.sourceId);
    if (!sourceId) {
      return res.status(400).json({ error: 'ID de fuente inválido' });
    }

    const [rows] = await db.query(
      'SELECT * FROM eu_article_sources WHERE id = ? AND type = "pdf"',
      [sourceId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'PDF no encontrado' });
    }

    const source = rows[0];

    // Check rate limit for PDF download
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.user?.id || null;
    const role = req.user?.role || 'FREE';

    const LIMITS = {
      FREE: 10,
      MONTHLY: 50,
      MOD: 200,
      ADMIN: 999
    };
    const limit = LIMITS[role] || LIMITS.FREE;

    const oneHourAgo = new Date(Date.now() - 3600000);
    const [[{ cnt }]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM eu_source_downloads 
       WHERE (user_id = ? OR ip_address = ?) AND downloaded_at > ?`,
      [userId, ip, oneHourAgo]
    );

    if (cnt >= limit) {
      return res.status(429).json({ error: 'Límite de descargas alcanzado. Intenta en una hora.' });
    }

    // Log download
    await db.query(
      'INSERT INTO eu_source_downloads (source_id, user_id, ip_address) VALUES (?, ?, ?)',
      [sourceId, userId, ip]
    );

    // Serve file
    try {
      await fs.access(source.pdf_path);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(source.pdf_original_name)}"`);
      res.sendFile(source.pdf_path);
    } catch (e) {
      res.status(404).json({ error: 'Archivo PDF no encontrado en el servidor' });
    }
  } catch (err) {
    console.error('GET /sources/pdf/:id error:', err);
    res.status(500).json({ error: 'Error al descargar PDF' });
  }
}

// ============================================================
// GET /api/articles/:id/sources - Get all sources for article
// ============================================================
router.get('/:id/sources', async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    if (!articleId) {
      return res.status(400).json({ error: 'ID de artículo inválido' });
    }

    const [rows] = await db.query(
      `SELECT id, type, title, url, pdf_original_name, pdf_size, favicon_url, display_order, created_at
       FROM eu_article_sources 
       WHERE article_id = ?
       ORDER BY display_order ASC, created_at ASC`,
      [articleId]
    );
    const enriched = rows.map(r => ({
      ...r,
      download_url: r.type === 'pdf' ? `/api/sources/pdf/${r.id}` : r.url
    }));

    // Separate PDFs and links, PDFs first
    const pdfs = enriched.filter(r => r.type === 'pdf');
    const links = enriched.filter(r => r.type === 'link');

    res.json({
      pdfs,
      links,
      counts: {
        pdfs: pdfs.length,
        links: links.length,
        total: rows.length
      }
    });
  } catch (err) {
    console.error('GET /sources error:', err);
    res.status(500).json({ error: 'Error al obtener fuentes' });
  }
});

// ============================================================
// POST /api/articles/:id/sources - Add new source (link or PDF)
// ============================================================
router.post('/:id/sources', requireAuth, checkRateLimit('upload_pdf'), async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    if (!articleId) {
      return res.status(400).json({ error: 'ID de artículo inválido' });
    }

    const { type, title, url } = req.body;

    if (!type || !title) {
      return res.status(400).json({ error: 'Tipo y título son obligatorios' });
    }

    if (type !== 'link' && type !== 'pdf') {
      return res.status(400).json({ error: 'Tipo debe ser "link" o "pdf"' });
    }

    // Check permissions (owner or mod)
    const [article] = await db.query(
      'SELECT author_id FROM eu_articles WHERE id = ?',
      [articleId]
    );

    if (!article.length) {
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }

    const isOwner = article[0].author_id === req.user.id;
    const isMod = ['MOD', 'ADMIN'].includes(req.user.role);

    if (!isOwner && !isMod) {
      return res.status(403).json({ error: 'No tienes permiso para editar las fuentes de este artículo' });
    }

    // Check limits
    const counts = await getSourceCounts(articleId);

    if (counts.total >= MAX_TOTAL_SOURCES) {
      return res.status(400).json({
        error: `Límite de ${MAX_TOTAL_SOURCES} fuentes alcanzado para este artículo`
      });
    }

    if (type === 'link' && counts.links >= MAX_LINKS_PER_ARTICLE) {
      return res.status(400).json({ 
        error: `Límite de ${MAX_LINKS_PER_ARTICLE} enlaces alcanzado para este artículo` 
      });
    }

    if (type === 'pdf' && counts.pdfs >= MAX_PDFS_PER_ARTICLE) {
      return res.status(400).json({ 
        error: `Límite de ${MAX_PDFS_PER_ARTICLE} PDFs alcanzado para este artículo` 
      });
    }

    let result;
    let pdfPath = null;
    let pdfOriginalName = null;
    let pdfSize = 0;
    let faviconUrl = null;

    if (type === 'link') {
      // Validate URL
      if (!url || !isValidUrl(url)) {
        return res.status(400).json({ error: 'URL inválida' });
      }
      faviconUrl = getFaviconUrl(url);

      [result] = await db.query(
        `INSERT INTO eu_article_sources (article_id, type, title, url, favicon_url)
         VALUES (?, 'link', ?, ?, ?)`,
        [articleId, title, url, faviconUrl]
      );
    } else {
      // PDF - handled via multipart form upload, not JSON body
      return res.status(400).json({ 
        error: 'Para subir PDFs usa el endpoint /api/articles/:id/sources/pdf con Content-Type: multipart/form-data' 
      });
    }

    // Update article sources_count
    await db.query(
      'UPDATE eu_articles SET sources_count = sources_count + 1 WHERE id = ?',
      [articleId]
    );

    res.status(201).json({
      message: 'Fuente añadida exitosamente',
      source: {
        id: result.insertId,
        type,
        title,
        url: url || null,
        pdf_path: pdfPath,
        pdf_original_name: pdfOriginalName,
        pdf_size: pdfSize,
        favicon_url: faviconUrl,
        download_url: url || null
      }
    });
  } catch (err) {
    console.error('POST /sources error:', err);
    res.status(500).json({ error: 'Error al añadir fuente' });
  }
});

// ============================================================
// POST /api/articles/:id/sources/pdf - Upload PDF source
// ============================================================
const multer = require('multer');

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'));
    }
  }
});

router.post('/:id/sources/pdf', 
  requireAuth, 
  checkRateLimit('upload_pdf'),
  pdfUpload.single('pdf'),
  async (req, res) => {
    try {
      const articleId = parseInt(req.params.id);
      if (!articleId) {
        return res.status(400).json({ error: 'ID de artículo inválido' });
      }

      const { title } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo PDF' });
      }

      if (!title) {
        return res.status(400).json({ error: 'El título es obligatorio' });
      }

      // Check permissions
      const [article] = await db.query(
        'SELECT author_id FROM eu_articles WHERE id = ?',
        [articleId]
      );

      if (!article.length) {
        return res.status(404).json({ error: 'Artículo no encontrado' });
      }

      const isOwner = article[0].author_id === req.user.id;
      const isMod = ['MOD', 'ADMIN'].includes(req.user.role);

      if (!isOwner && !isMod) {
        return res.status(403).json({ error: 'No tienes permiso para editar este artículo' });
      }

      // Check PDF limit
      const counts = await getSourceCounts(articleId);

      if (counts.total >= MAX_TOTAL_SOURCES) {
        return res.status(400).json({ 
          error: `Límite de ${MAX_TOTAL_SOURCES} fuentes alcanzado para este artículo` 
        });
      }
      if (counts.pdfs >= MAX_PDFS_PER_ARTICLE) {
        return res.status(400).json({ 
          error: `Límite de ${MAX_PDFS_PER_ARTICLE} PDFs alcanzado para este artículo` 
        });
      }

      // Save PDF file
      const filename = `${uuidv4()}.pdf`;
      const dir = path.join(STORAGE, 'articles', String(articleId), 'pdfs');
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, req.file.buffer);

      const [[{ maxOrder }]] = await db.query(
        'SELECT COALESCE(MAX(display_order), 0) + 1 AS maxOrder FROM eu_article_sources WHERE article_id = ?',
        [articleId]
      );

      const [result] = await db.query(
        `INSERT INTO eu_article_sources 
         (article_id, type, title, pdf_path, pdf_original_name, pdf_size, display_order)
         VALUES (?, 'pdf', ?, ?, ?, ?, ?)`,
        [articleId, title, filePath, req.file.originalname, req.file.size, maxOrder]
      );

      // Update article sources_count
      await db.query(
        'UPDATE eu_articles SET sources_count = sources_count + 1 WHERE id = ?',
        [articleId]
      );

      res.status(201).json({
        message: 'PDF subido exitosamente',
        source: {
          id: result.insertId,
          type: 'pdf',
          title,
          pdf_original_name: req.file.originalname,
          pdf_size: req.file.size,
          pdf_path: filePath,
          download_url: `/api/sources/pdf/${result.insertId}`
        }
      });
    } catch (err) {
      console.error('POST /sources/pdf error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `El PDF supera el límite de ${MAX_PDF_SIZE / 1024 / 1024}MB` });
      }
      res.status(500).json({ error: 'Error al subir PDF' });
    }
  }
);

// ============================================================
// PUT /api/articles/:id/sources/:sourceId - Update source
// ============================================================
router.put('/:id/sources/:sourceId', requireAuth, async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    const sourceId = parseInt(req.params.sourceId);

    if (!articleId || !sourceId) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { title, url } = req.body;

    // Check permissions
    const [article] = await db.query(
      'SELECT author_id FROM eu_articles WHERE id = ?',
      [articleId]
    );

    if (!article.length) {
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }

    const isOwner = article[0].author_id === req.user.id;
    const isMod = ['MOD', 'ADMIN'].includes(req.user.role);

    if (!isOwner && !isMod) {
      return res.status(403).json({ error: 'No tienes permiso para editar este artículo' });
    }

    // Get current source
    const [source] = await db.query(
      'SELECT * FROM eu_article_sources WHERE id = ? AND article_id = ?',
      [sourceId, articleId]
    );

    if (!source.length) {
      return res.status(404).json({ error: 'Fuente no encontrada' });
    }

    const currentSource = source[0];

    // Update fields
    const updateData = { title: title || currentSource.title };
    let faviconUrl = currentSource.favicon_url;

    if (currentSource.type === 'link' && url) {
      if (!isValidUrl(url)) {
        return res.status(400).json({ error: 'URL inválida' });
      }
      updateData.url = url;
      faviconUrl = getFaviconUrl(url);
      updateData.favicon_url = faviconUrl;
    }

    await db.query(
      `UPDATE eu_article_sources SET title = ?, url = ?, favicon_url = ? WHERE id = ?`,
      [updateData.title, updateData.url || null, faviconUrl, sourceId]
    );

    res.json({
      message: 'Fuente actualizada',
      source: { ...currentSource, ...updateData }
    });
  } catch (err) {
    console.error('PUT /sources/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar fuente' });
  }
});

// ============================================================
// DELETE /api/articles/:id/sources/:sourceId - Delete source
// ============================================================
router.delete('/:id/sources/:sourceId', requireAuth, async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    const sourceId = parseInt(req.params.sourceId);

    if (!articleId || !sourceId) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Check permissions
    const [article] = await db.query(
      'SELECT author_id FROM eu_articles WHERE id = ?',
      [articleId]
    );

    if (!article.length) {
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }

    const isOwner = article[0].author_id === req.user.id;
    const isMod = ['MOD', 'ADMIN'].includes(req.user.role);

    if (!isOwner && !isMod) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar fuentes de este artículo' });
    }

    // Get source to check if PDF (need to delete file)
    const [source] = await db.query(
      'SELECT * FROM eu_article_sources WHERE id = ? AND article_id = ?',
      [sourceId, articleId]
    );

    if (!source.length) {
      return res.status(404).json({ error: 'Fuente no encontrada' });
    }

    // Delete PDF file if exists
    if (source[0].type === 'pdf' && source[0].pdf_path) {
      try {
        await fs.unlink(source[0].pdf_path);
      } catch (e) {
        console.warn('Could not delete PDF file:', e.message);
      }
    }

    // Delete from database
    await db.query(
      'DELETE FROM eu_article_sources WHERE id = ?',
      [sourceId]
    );

    // Update article count
    await db.query(
      'UPDATE eu_articles SET sources_count = GREATEST(sources_count - 1, 0) WHERE id = ?',
      [articleId]
    );

    res.json({ message: 'Fuente eliminada correctamente' });
  } catch (err) {
    console.error('DELETE /sources/:id error:', err);
    res.status(500).json({ error: 'Error al eliminar fuente' });
  }
});

// ============================================================
// Reorder sources
// ============================================================
router.put('/:id/sources/reorder', requireAuth, async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    const { sourceIds } = req.body; // Array of source IDs in new order

    if (!articleId || !Array.isArray(sourceIds)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    // Check permissions
    const [article] = await db.query(
      'SELECT author_id FROM eu_articles WHERE id = ?',
      [articleId]
    );

    if (!article.length) {
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }

    const isOwner = article[0].author_id === req.user.id;
    const isMod = ['MOD', 'ADMIN'].includes(req.user.role);

    if (!isOwner && !isMod) {
      return res.status(403).json({ error: 'No tienes permiso para reordernar fuentes' });
    }

    // Update order
    for (let i = 0; i < sourceIds.length; i++) {
      await db.query(
        'UPDATE eu_article_sources SET display_order = ? WHERE id = ? AND article_id = ?',
        [i, sourceIds[i], articleId]
      );
    }

    res.json({ message: 'Orden actualizado' });
  } catch (err) {
    console.error('PUT /sources/reorder error:', err);
    res.status(500).json({ error: 'Error al reordernar fuentes' });
  }
});

module.exports = { router, downloadPdf };
