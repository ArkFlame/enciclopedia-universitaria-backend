const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// POST /api/payments/create-preference - Crear preferencia de pago
router.post('/create-preference', requireAuth, async (req, res) => {
  try {
    if (['MONTHLY', 'ADMIN', 'MOD'].includes(req.user.role))
      return res.status(400).json({ error: 'Ya tienes una suscripción activa o rol especial' });

    const preference = new Preference(client);
    const price = parseFloat(process.env.SUBSCRIPTION_PRICE) || 1000;
    const frontendUrl = process.env.FRONTEND_URL || 'https://tuusuario.github.io/enciclopedia-universitaria';

    const response = await preference.create({
      body: {
        items: [{
          id: 'subscription-monthly',
          title: 'Enciclopedia Universitaria - Acceso Mensual',
          description: 'Acceso ilimitado a todos los artículos por 30 días',
          quantity: 1,
          unit_price: price,
          currency_id: process.env.SUBSCRIPTION_CURRENCY || 'ARS'
        }],
        payer: {
          email: req.user.email
        },
        back_urls: {
          success: `${frontendUrl}/pago-exitoso.html`,
          failure: `${frontendUrl}/pago-fallido.html`,
          pending: `${frontendUrl}/pago-pendiente.html`
        },
        auto_return: 'approved',
        external_reference: String(req.user.id),
        notification_url: `${process.env.BASE_URL}/api/payments/webhook`,
        statement_descriptor: 'ENCICLOPEDIA UNIV',
        expires: false
      }
    });

    // Registrar preferencia en historial
    await db.query(
      `INSERT INTO eu_payment_history (user_id, mp_payment_id, mp_preference_id, amount, currency, status)
       VALUES (?, 'pending', ?, ?, ?, 'pending')`,
      [req.user.id, response.id, price, process.env.SUBSCRIPTION_CURRENCY || 'ARS']
    );

    res.json({
      preferenceId: response.id,
      initPoint: response.init_point,
      sandboxInitPoint: response.sandbox_init_point
    });
  } catch (err) {
    console.error('Error creando preferencia MP:', err);
    res.status(500).json({ error: 'Error al iniciar el proceso de pago' });
  }
});

// POST /api/payments/webhook - Webhook de MercadoPago
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const { type, data, action } = JSON.parse(req.body);

    // Verificar firma si está disponible
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    if (xSignature && process.env.MP_WEBHOOK_SECRET) {
      const parts = xSignature.split(',');
      const ts = parts.find(p => p.startsWith('ts='))?.slice(3);
      const hash = parts.find(p => p.startsWith('v1='))?.slice(3);
      const manifest = `id:${data?.id};request-id:${xRequestId};ts:${ts};`;
      const expected = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');
      if (expected !== hash) {
        console.warn('⚠️ Webhook firma inválida');
        return res.status(401).json({ error: 'Firma inválida' });
      }
    }

    // Solo procesar pagos aprobados
    if (type !== 'payment' || !data?.id) {
      return res.status(200).json({ received: true });
    }

    // Consultar el pago en MP
    const payment = new Payment(client);
    const paymentData = await payment.get({ id: data.id });

    if (paymentData.status !== 'approved') {
      return res.status(200).json({ received: true });
    }

    const userId = parseInt(paymentData.external_reference);
    if (!userId || isNaN(userId)) return res.status(400).json({ error: 'external_reference inválido' });

    const [users] = await db.query('SELECT id, role FROM eu_users WHERE id = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = users[0];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 días

    // Actualizar rol a MONTHLY si no tiene rol especial
    if (!['ADMIN', 'MOD'].includes(user.role)) {
      await db.query(
        `UPDATE eu_users SET role = 'MONTHLY', paid_at = ?, monthly_expires_at = ?, role_assigned_at = ? WHERE id = ?`,
        [now, expiresAt, now, userId]
      );
    }

    // Registrar en historial
    await db.query(
      `UPDATE eu_payment_history SET mp_payment_id = ?, status = 'approved', paid_at = ?, expires_at = ?, 
       payment_method = ?, raw_notification = ?
       WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [String(paymentData.id), now, expiresAt,
       paymentData.payment_method_id || 'unknown',
       JSON.stringify(paymentData), userId]
    );

    // Si no actualizó ninguna fila (pago nuevo directo), insertar
    await db.query(
      `INSERT IGNORE INTO eu_payment_history (user_id, mp_payment_id, mp_preference_id, amount, currency, status, paid_at, expires_at, payment_method, raw_notification)
       VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`,
      [userId, String(paymentData.id), paymentData.preference_id,
       paymentData.transaction_amount, paymentData.currency_id || 'ARS',
       now, expiresAt, paymentData.payment_method_id, JSON.stringify(paymentData)]
    );

    // Notificar al usuario
    await db.query(
      `INSERT INTO eu_notifications (user_id, type, message) VALUES (?, 'subscription_activated', ?)`,
      [userId, `¡Suscripción mensual activada! Expira el ${expiresAt.toLocaleDateString('es-AR')}. Disfruta de acceso ilimitado.`]
    );
    await db.query('UPDATE eu_users SET notification_count = notification_count + 1 WHERE id = ?', [userId]);

    console.log(`✅ Pago aprobado. Usuario ${userId} → MONTHLY hasta ${expiresAt.toISOString()}`);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error procesando webhook MP:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/payments/history - Historial de pagos del usuario
router.get('/history', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, mp_payment_id, amount, currency, status, paid_at, expires_at, payment_method, created_at
       FROM eu_payment_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

module.exports = router;
