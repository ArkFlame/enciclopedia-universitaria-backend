const db = require('../config/db');

const LIMITS = {
  FREE: {
    submit_article: 1,    // por hora
    edit_article: 1,
    upload_image: 3,
    upload_pdf: 2,
    download_pdf: 10
  },
  MONTHLY: {
    submit_article: 10,
    edit_article: 10,
    upload_image: 20,
    upload_pdf: 10,
    download_pdf: 50
  },
  MOD: {
    submit_article: 50,
    edit_article: 50,
    upload_image: 100,
    upload_pdf: 50,
    download_pdf: 200
  },
  ADMIN: {
    submit_article: 999,
    edit_article: 999,
    upload_image: 999,
    upload_pdf: 999,
    download_pdf: 999
  }
};

/**
 * Verifica y registra rate limit por acción.
 * action: 'submit_article' | 'edit_article' | 'upload_image' | 'upload_pdf' | 'download_pdf'
 */
const checkRateLimit = (action) => async (req, res, next) => {
  const userId = req.user?.id || null;
  const ip = req.ip || req.connection.remoteAddress;
  const role = req.user?.role || 'FREE';
  const limit = LIMITS[role]?.[action] ?? LIMITS.FREE[action];

  const oneHourAgo = new Date(Date.now() - 3600000);

  // Contar acciones del usuario/IP en la última hora
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM eu_rate_limit_log 
     WHERE (user_id = ? OR ip_address = ?) AND action = ? AND created_at > ?`,
    [userId, ip, action, oneHourAgo]
  );

  const count = rows[0].cnt;

  if (count >= limit) {
    const minutes = 60 - Math.floor((Date.now() - new Date(oneHourAgo).getTime()) / 60000);
    return res.status(429).json({
      error: `Límite de ${action === 'submit_article' ? 'publicación' : action === 'edit_article' ? 'edición' : 'subida'} alcanzado. Intenta en ~${minutes} minutos.`,
      limit,
      role
    });
  }

  // Registrar acción
  await db.query(
    'INSERT INTO eu_rate_limit_log (user_id, ip_address, action) VALUES (?, ?, ?)',
    [userId, ip, action]
  );

  next();
};

// Limpiar logs viejos (ejecutar periódicamente)
const cleanOldLogs = async () => {
  try {
    await db.query('DELETE FROM eu_rate_limit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)');
  } catch (e) {
    console.error('Error limpiando rate limit logs:', e.message);
  }
};

module.exports = { checkRateLimit, cleanOldLogs };
