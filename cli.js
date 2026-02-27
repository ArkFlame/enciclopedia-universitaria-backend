#!/usr/bin/env node
/**
 * CLI - Enciclopedia Universitaria
 * Uso: node cli.js <comando> [argumentos]
 * 
 * Comandos:
 *   promote <email|username> <ADMIN|MOD|MONTHLY|FREE>
 *   list-users [role]
 *   delete-user <email>
 *   stats
 *   revoke-expired
 */

require('dotenv').config();
const db = require('./config/db');

const ROLES = ['FREE', 'MONTHLY', 'MOD', 'ADMIN'];
const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m'
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

async function main() {
  const [,, cmd, ...args] = process.argv;

  if (!cmd) {
    printHelp();
    process.exit(0);
  }

  try {
    switch (cmd) {
      case 'promote': await cmdPromote(args); break;
      case 'list-users': await cmdListUsers(args); break;
      case 'delete-user': await cmdDeleteUser(args); break;
      case 'stats': await cmdStats(); break;
      case 'revoke-expired': await cmdRevokeExpired(); break;
      case 'help': printHelp(); break;
      default:
        console.error(c('red', `❌ Comando desconocido: ${cmd}`));
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(c('red', `❌ Error: ${err.message}`));
    process.exit(1);
  }

  process.exit(0);
}

async function cmdPromote([identifier, role]) {
  if (!identifier || !role) {
    console.error(c('red', 'Uso: node cli.js promote <email|username> <ADMIN|MOD|MONTHLY|FREE>'));
    process.exit(1);
  }

  const roleUpper = role.toUpperCase();
  if (!ROLES.includes(roleUpper)) {
    console.error(c('red', `Rol inválido. Válidos: ${ROLES.join(', ')}`));
    process.exit(1);
  }

  const [rows] = await db.query(
    'SELECT id, username, email, role FROM eu_users WHERE email = ? OR username = ?',
    [identifier, identifier]
  );

  if (!rows.length) {
    console.error(c('red', `❌ Usuario no encontrado: ${identifier}`));
    process.exit(1);
  }

  const user = rows[0];
  const now = new Date();
  let expiresAt = null;

  if (roleUpper === 'MONTHLY') {
    expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE eu_users SET role = ?, role_assigned_at = ?, paid_at = ?, monthly_expires_at = ? WHERE id = ?`,
      [roleUpper, now, now, expiresAt, user.id]
    );
    // Registrar en historial
    await db.query(
      `INSERT INTO eu_payment_history (user_id, mp_payment_id, amount, currency, status, paid_at, expires_at, payment_method)
       VALUES (?, 'CLI-MANUAL', 0, 'ARS', 'approved', ?, ?, 'cli_manual')`,
      [user.id, now, expiresAt]
    );
  } else {
    await db.query(
      `UPDATE eu_users SET role = ?, role_assigned_at = ?, paid_at = NULL, monthly_expires_at = NULL WHERE id = ?`,
      [roleUpper, now, user.id]
    );
  }

  console.log(c('green', `✅ Rol actualizado: ${user.username} (${user.email})`));
  console.log(`   ${c('dim', user.role)} → ${c('bold', roleUpper)}`);
  if (expiresAt) {
    console.log(`   Expira: ${c('yellow', expiresAt.toLocaleString('es-AR'))}`);
  }
}

async function cmdListUsers([roleFilter]) {
  const where = roleFilter ? `WHERE role = '${roleFilter.toUpperCase()}'` : '';
  const [rows] = await db.query(
    `SELECT id, username, email, role, created_at, monthly_expires_at 
     FROM eu_users ${where} ORDER BY role, created_at DESC LIMIT 100`
  );

  if (!rows.length) {
    console.log(c('yellow', 'No se encontraron usuarios'));
    return;
  }

  const roleColors = { ADMIN: 'red', MOD: 'cyan', MONTHLY: 'green', FREE: 'dim' };

  console.log(c('bold', `\n📋 Usuarios (${rows.length})\n`));
  console.log(`${'ID'.padEnd(6)} ${'Username'.padEnd(20)} ${'Email'.padEnd(35)} ${'Rol'.padEnd(10)} ${'Creado'}`);
  console.log('─'.repeat(90));

  for (const u of rows) {
    const roleColor = roleColors[u.role] || 'reset';
    const expires = u.monthly_expires_at ? ` (exp: ${new Date(u.monthly_expires_at).toLocaleDateString('es-AR')})` : '';
    console.log(
      `${String(u.id).padEnd(6)} ${u.username.padEnd(20)} ${u.email.padEnd(35)} ${c(roleColor, u.role.padEnd(10))} ${new Date(u.created_at).toLocaleDateString('es-AR')}${expires}`
    );
  }
}

async function cmdDeleteUser([identifier]) {
  if (!identifier) {
    console.error(c('red', 'Uso: node cli.js delete-user <email|username>'));
    process.exit(1);
  }

  const [rows] = await db.query(
    'SELECT id, username, email, role FROM eu_users WHERE email = ? OR username = ?',
    [identifier, identifier]
  );

  if (!rows.length) {
    console.error(c('red', `❌ Usuario no encontrado: ${identifier}`));
    process.exit(1);
  }

  const user = rows[0];

  if (user.role === 'ADMIN') {
    console.error(c('red', '❌ No se puede eliminar un usuario ADMIN desde la CLI'));
    process.exit(1);
  }

  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  readline.question(c('yellow', `⚠️  Eliminar usuario ${user.username} (${user.email}) con rol ${user.role}? [s/N] `), async (answer) => {
    readline.close();
    if (answer.toLowerCase() !== 's') {
      console.log('Cancelado');
      process.exit(0);
    }
    await db.query('DELETE FROM eu_users WHERE id = ?', [user.id]);
    console.log(c('green', `✅ Usuario ${user.username} eliminado`));
    process.exit(0);
  });
}

async function cmdStats() {
  const [[art]] = await db.query(
    `SELECT SUM(status='PENDING') AS pending, SUM(status='APPROVED') AS approved, SUM(status='REJECTED') AS rejected FROM eu_articles`
  );
  const [[users]] = await db.query(
    `SELECT SUM(role='FREE') AS free, SUM(role='MONTHLY') AS monthly, SUM(role='MOD') AS mod, SUM(role='ADMIN') AS admin, COUNT(*) AS total FROM eu_users`
  );
  const [[pay]] = await db.query(
    `SELECT SUM(amount) AS revenue, COUNT(*) AS payments FROM eu_payment_history WHERE status='approved'`
  );

  console.log(c('bold', '\n📊 Estadísticas de Enciclopedia Universitaria\n'));
  console.log(c('cyan', '── Artículos ──────────────────────'));
  console.log(`  Pendientes: ${c('yellow', art.pending || 0)}`);
  console.log(`  Aprobados:  ${c('green', art.approved || 0)}`);
  console.log(`  Rechazados: ${c('red', art.rejected || 0)}`);
  console.log(c('cyan', '\n── Usuarios ───────────────────────'));
  console.log(`  Total:   ${c('bold', users.total)}`);
  console.log(`  FREE:    ${users.free || 0}`);
  console.log(`  MONTHLY: ${c('green', users.monthly || 0)}`);
  console.log(`  MOD:     ${c('cyan', users.mod || 0)}`);
  console.log(`  ADMIN:   ${c('red', users.admin || 0)}`);
  console.log(c('cyan', '\n── Pagos ──────────────────────────'));
  console.log(`  Ingresos totales: ${c('green', `$${parseFloat(pay.revenue || 0).toLocaleString('es-AR')} ARS`)}`);
  console.log(`  Pagos aprobados:  ${pay.payments || 0}\n`);
}

async function cmdRevokeExpired() {
  console.log('🔄 Revocando suscripciones expiradas...');
  const [expired] = await db.query(
    `SELECT id, username, email, monthly_expires_at FROM eu_users 
     WHERE role = 'MONTHLY' AND monthly_expires_at < NOW()`
  );

  if (!expired.length) {
    console.log(c('green', '✅ No hay suscripciones expiradas'));
    return;
  }

  for (const user of expired) {
    await db.query(`UPDATE eu_users SET role = 'FREE', monthly_expires_at = NULL WHERE id = ?`, [user.id]);
    console.log(`  ⚠️ Revocado: ${user.username} (expiró: ${new Date(user.monthly_expires_at).toLocaleDateString('es-AR')})`);
  }
  console.log(c('green', `✅ ${expired.length} suscripciones revocadas`));
}

function printHelp() {
  console.log(`
${c('bold', '📚 CLI - Enciclopedia Universitaria')}

${c('cyan', 'Uso:')} node cli.js <comando> [argumentos]

${c('cyan', 'Comandos:')}
  ${c('green', 'promote')} <email|username> <ROL>   Asignar rol a usuario (FREE/MONTHLY/MOD/ADMIN)
  ${c('green', 'list-users')} [rol]                 Listar usuarios (opcional: filtrar por rol)
  ${c('green', 'delete-user')} <email|username>     Eliminar usuario
  ${c('green', 'stats')}                            Ver estadísticas generales
  ${c('green', 'revoke-expired')}                   Revocar suscripciones expiradas manualmente
  ${c('green', 'help')}                             Mostrar esta ayuda

${c('cyan', 'Ejemplos:')}
  node cli.js promote admin@ejemplo.com ADMIN
  node cli.js promote juan MONTHLY
  node cli.js list-users FREE
  node cli.js stats
  `);
}

main().catch(err => {
  console.error(c('red', `❌ Error fatal: ${err.message}`));
  process.exit(1);
});
