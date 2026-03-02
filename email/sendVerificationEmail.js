const { getResendClient } = require('./resendClient');

const FROM_ADDRESS = process.env.EMAIL_FROM || 'Enciclopedia Universitaria <noreply@arkflame.com>';

/**
 * Sends an account verification email.
 * @param {string} toEmail  - Recipient email address
 * @param {string} username - Recipient username (for personalization)
 * @param {string} token    - Raw verification token
 */
async function sendVerificationEmail(toEmail, username, token) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://enciclopedia.arkflame.com';
  const verificationLink = `${frontendUrl}/verificar-email?token=${token}`;

  const resend = getResendClient();

  const response = await resend.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: 'Verifica tu cuenta — Enciclopedia Universitaria',
    html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verifica tu cuenta</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.08)">
          
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
                ¡Hola, ${username}!
              </h2>
              <p style="margin:0 0 24px;color:#444;line-height:1.6;font-size:0.95rem">
                Gracias por registrarte. Para poder publicar y editar artículos en la enciclopedia, 
                necesitas verificar tu dirección de correo electrónico.
              </p>
              <p style="margin:0 0 28px;color:#444;line-height:1.6;font-size:0.95rem">
                Haz clic en el botón de abajo. El enlace es válido por <strong>24 horas</strong>.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${verificationLink}" 
                       style="display:inline-block;padding:14px 36px;background:#4f46e5;color:#fff;
                              text-decoration:none;border-radius:8px;font-weight:600;font-size:0.95rem;
                              letter-spacing:0.3px">
                      ✓ Verificar mi cuenta
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;color:#888;font-size:0.82rem;line-height:1.5">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${verificationLink}" style="color:#4f46e5;word-break:break-all">${verificationLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f0f0f0">
              <p style="margin:0;color:#aaa;font-size:0.78rem;text-align:center;line-height:1.5">
                Si no creaste esta cuenta, puedes ignorar este correo.<br>
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

module.exports = { sendVerificationEmail };
