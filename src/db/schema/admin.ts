import {
  mysqlTable,
  bigint,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  int,
  decimal,
  json,
  index,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const paymentHistory = mysqlTable(
  'eu_payment_history',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: bigint('user_id', { unsigned: true }).notNull(),
    mpPaymentId: varchar('mp_payment_id', { length: 100 }).notNull(),
    mpPreferenceId: varchar('mp_preference_id', { length: 150 }),
    mpMerchantOrder: varchar('mp_merchant_order', { length: 100 }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 10 }).notNull().default('ARS'),
    status: mysqlEnum('status', ['pending', 'approved', 'rejected', 'refunded']).notNull().default('pending'),
    paymentMethod: varchar('payment_method', { length: 50 }),
    paidAt: timestamp('paid_at'),
    expiresAt: timestamp('expires_at'),
    rawNotification: json('raw_notification'),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
  },
  (table) => [
    index('idx_eu_payment_history_user_id').on(table.userId),
    index('idx_eu_payment_history_mp_payment').on(table.mpPaymentId),
    index('idx_eu_payment_history_status').on(table.status),
    foreignKey({
      name: 'fk_eu_ph_user',
      columns: [table.userId],
      foreignColumns: [users.id],
      onDelete: 'cascade',
    }),
  ],
);

export const adminLogs = mysqlTable(
  'eu_admin_logs',
  {
    id: int('id').autoincrement().primaryKey(),
    adminId: int('admin_id').notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    targetType: varchar('target_type', { length: 50 }),
    targetId: int('target_id'),
    details: json('details'),
    ipAddress: varchar('ip_address', { length: 50 }),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
  },
  (table) => [
    index('idx_eu_admin_logs_admin').on(table.adminId),
    index('idx_eu_admin_logs_created').on(table.createdAt),
    foreignKey({
      name: 'fk_eu_admin_logs_admin',
      columns: [table.adminId],
      foreignColumns: [users.id],
      onDelete: 'cascade',
    }),
  ],
);

export const rateLimitLogs = mysqlTable(
  'eu_rate_limit_log',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id'),
    ipAddress: varchar('ip_address', { length: 50 }).notNull(),
    action: mysqlEnum('action', ['submit_article', 'edit_article', 'upload_image']).notNull(),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
  },
  (table) => [
    index('idx_eu_rate_limit_user_action').on(table.userId, table.action, table.createdAt),
    index('idx_eu_rate_limit_ip_action').on(table.ipAddress, table.action, table.createdAt),
  ],
);

export const paymentHistoryRelations = relations(paymentHistory, ({ one }) => ({
  user: one(users, {
    fields: [paymentHistory.userId],
    references: [users.id],
  }),
}));

export const adminLogsRelations = relations(adminLogs, ({ one }) => ({
  admin: one(users, {
    fields: [adminLogs.adminId],
    references: [users.id],
  }),
}));
