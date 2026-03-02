const { getResendClient } = require('./resendClient');

const FROM_ADDRESS = process.env.EMAIL_FROM || 'Enciclopedia Universitaria <noreply@arkflame.com>';

/**
 * Sends a password reset email.
 * @param {string} toEmail  - Recipient email address
 * @param {string} username - Recipient username
 * @param {string} token    - Raw reset token
 */
async function sendPasswordResetEmail(toEmail, username, token) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://enciclopedia.arkflame.com';
  const resetLink   = `${frontendUrl}/nueva-contrasena.html?token=${token}`;

  const resend = getResendClient();

  const response = await resend.emails.send({
    from: FROM_ADDRESS,
    to:   toEmail,
    subject: 'Recuperar contraseña — Enciclopedia Universitaria',
    html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperar contraseña</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.08)">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:32px 40px;text-align:center">
              <span style="font-size:2.5rem;display:block;margin-bottom:8px">Σ</span>
              <h1 style="color:#ffffff;margin:0;font-size:1.4rem;font-weight:700;letter-spacing:-0.5px">
                Enciclopedia Universitaria
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px">
              <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:1.2rem;font-weight:600">
                Hola, ${username}
              </h2>
              <p style="margin:0 0 16px;color:#444;line-height:1.6;font-size:0.95rem">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta.
              </p>
              <p style="margin:0 0 28px;color:#444;line-height:1.6;font-size:0.95rem">
                Haz clic en el botón de abajo para crear una nueva contraseña.
                Este enlace es válido por <strong>1 hora</strong>.
              </p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${resetLink}"
                       style="display:inline-block;padding:14px 36px;background:#dc2626;color:#fff;
                              text-decoration:none;border-radius:8px;font-weight:600;font-size:0.95rem;
                              letter-spacing:0.3px">
                      🔑 Restablecer contraseña
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security notice -->
              <div style="margin-top:28px;padding:16px;background:#fef2f2;border-radius:8px;border-left:4px solid #dc2626">
                <p style="margin:0;color:#7f1d1d;font-size:0.84rem;line-height:1.5">
                  <strong>⚠️ Si no solicitaste este cambio</strong>, ignora este correo.
                  Tu contraseña seguirá siendo la misma y el enlace expirará automáticamente.
                </p>
              </div>

              <p style="margin:20px 0 0;color:#888;font-size:0.82rem;line-height:1.5">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${resetLink}" style="color:#dc2626;word-break:break-all">${resetLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f0f0f0">
              <p style="margin:0;color:#aaa;font-size:0.78rem;text-align:center;line-height:1.5">
                Este enlace expirará en 1 hora por razones de seguridad.<br>
                © ${new Date().getFullYear()} Enciclopedia Universitaria
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  });

  return response;
}

module.exports = { sendPasswordResetEmail };
