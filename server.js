require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const db = require('./config/db');
const { cleanOldLogs } = require('./middleware/rateLimit');
const { authLimiter, loginLimiter, tokenSanityCheck } = require('./middleware/securityLimiter');
const { isBootstrapRequired } = require('./src/db/bootstrap');
const { importLegacyData } = require('./src/db/legacyImporter');

const app = express();
const PORT = process.env.PORT || 3594;

// ─── TRUST PROXY ─────────────────────────────────────────────────
// Necesario porque nginx actúa como proxy inverso y añade X-Forwarded-For.
// '1' significa: confiar solo en el primer proxy (nginx en el mismo servidor).
// Esto permite que express-rate-limit identifique la IP real del cliente.
app.set('trust proxy', 1);

// ─── SEGURIDAD ───────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false // Gestionado en frontend
}));

app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:4000', // Jekyll dev
    'http://127.0.0.1:4000'
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limit global (protección básica DDoS)
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,
  message: { error: 'Demasiadas solicitudes, intenta en unos minutos' },
  standardHeaders: true,
  legacyHeaders: false
}));

// ─── PARSERS ─────────────────────────────────────────────────────
// Para el webhook de MP necesitamos el body crudo
app.use('/api/payments/webhook', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── LOGGING ─────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ─── ARCHIVOS ESTÁTICOS ──────────────────────────────────────────
const STORAGE = process.env.STORAGE_PATH || path.join(__dirname, 'storage');
app.use('/media', express.static(path.join(STORAGE, 'images'), {
  maxAge: '7d',
  etag: true,
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// ─── RUTAS API ───────────────────────────────────────────────────
const aiRouter       = require('./ai/routes');
const articlesRouter = require('./routes/articles');
const sourcesRoutes  = require('./routes/sources');

// Auth routes — layered security:
//   authLimiter:      60 req / 10 min per IP across all auth endpoints
//   tokenSanityCheck: fast-rejects garbage tokens, bans IPs after 10 strikes
//   loginLimiter:     20 req / 15 min per IP only on login + register
const authRouter = require('./routes/auth');
app.use('/api/auth',
  authLimiter,
  tokenSanityCheck,
  (req, res, next) => {
    // Apply the tighter loginLimiter only to credential-submission endpoints
    if ((req.method === 'POST') &&
        (req.path === '/login' || req.path === '/register' || req.path === '/google')) {
      return loginLimiter(req, res, next);
    }
    next();
  },
  authRouter
);
app.use('/api/ai', aiRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/articles', sourcesRoutes.router);
app.get('/api/sources/pdf/:sourceId', sourcesRoutes.downloadPdf);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin', require('./routes/admin-categories'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/media',   require('./routes/media'));
app.use('/api/profile', require('./routes/profile'));

// Sitemap dinámico (SEO)
app.get('/sitemap.xml', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT slug, updated_at FROM eu_articles WHERE status = "APPROVED" ORDER BY updated_at DESC LIMIT 1000'
    );
    const frontendUrl = process.env.FRONTEND_URL || '';
    const urls = rows.map(a =>
      `<url><loc>${frontendUrl}/articulo.html?slug=${a.slug}</loc><lastmod>${new Date(a.updated_at).toISOString().split('T')[0]}</lastmod></url>`
    ).join('\n');

    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${frontendUrl}/</loc></url>
  ${urls}
</urlset>`);
  } catch (err) {
    res.status(500).send('Error generando sitemap');
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Error handler global
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── CRON JOBS ───────────────────────────────────────────────────

// Diariamente a las 2:00 AM - revocar suscripciones expiradas
cron.schedule('0 2 * * *', async () => {
  console.log('🔄 [CRON] Verificando suscripciones expiradas...');
  try {
    const [expired] = await db.query(
      `SELECT id, username, email, monthly_expires_at FROM eu_users 
       WHERE role = 'MONTHLY' AND monthly_expires_at IS NOT NULL AND monthly_expires_at < NOW()`
    );

    for (const user of expired) {
      await db.query(`UPDATE eu_users SET role = 'FREE', monthly_expires_at = NULL WHERE id = ?`, [user.id]);

      // Registrar en historial
      await db.query(
        `UPDATE eu_payment_history SET status = 'refunded' 
         WHERE user_id = ? AND status = 'approved' AND expires_at < NOW()`,
        [user.id]
      );

      // Notificar al usuario
      await db.query(
        `INSERT INTO eu_notifications (user_id, type, message) VALUES (?, 'subscription_expired', ?)`,
        [user.id, 'Tu suscripción mensual ha expirado. Renueva para seguir con acceso ilimitado.']
      );
      await db.query('UPDATE eu_users SET notification_count = notification_count + 1 WHERE id = ?', [user.id]);

      console.log(`  ⚠️ Suscripción revocada: ${user.username} (${user.email})`);
    }

    console.log(`✅ [CRON] ${expired.length} suscripciones revocadas`);
  } catch (err) {
    console.error('❌ [CRON] Error revocando suscripciones:', err);
  }
});

// Cada 2 horas - limpiar rate limit logs viejos
cron.schedule('0 */2 * * *', async () => {
  await cleanOldLogs();
});

// Diariamente - resetear articles_read_this_month si es nuevo mes
cron.schedule('5 0 1 * *', async () => {
  console.log('🔄 [CRON] Reseteando lecturas mensuales de usuarios FREE...');
  try {
    await db.query(
      `UPDATE eu_users SET articles_read_this_month = 0, articles_read_reset_at = NOW() WHERE role = 'FREE'`
    );
    console.log('✅ [CRON] Lecturas mensuales reseteadas');
  } catch (err) {
    console.error('❌ [CRON] Error reseteando lecturas:', err);
  }
});

// ─── BOOTSTRAP COORDINATOR ─────────────────────────────────────────
async function runBootstrap() {
  try {
    const needsBootstrap = await isBootstrapRequired();
    if (needsBootstrap) {
      console.log('[BOOTSTRAP] Drizzle DB empty, starting legacy data import...');
      const result = await importLegacyData();
      console.log('[BOOTSTRAP] Import completed:', result);
    } else {
      console.log('[BOOTSTRAP] Drizzle DB already initialized, skipping import');
    }
  } catch (error) {
    console.error('[BOOTSTRAP] Error during bootstrap:', error.message);
  }
}

// ─── INICIO ──────────────────────────────────────────────────────
runBootstrap().then(() => {
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║      ENCICLOPEDIA UNIVERSITARIA - BACKEND        ║
  ║                                                  ║
  ║  🚀 Servidor: http://localhost:${PORT}            ║
  ║  📊 MySQL: ${process.env.DB_HOST}:${process.env.DB_NAME}              ║
  ║  🌍 Frontend: ${process.env.FRONTEND_URL || 'no configurado'}
  ╚══════════════════════════════════════════════════╝
  `);
  });
});
