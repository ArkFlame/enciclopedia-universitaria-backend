import {
  mysqlTable,
  bigint,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

export const users = mysqlTable(
  'eu_users',
  {
    id: int('id').autoincrement().primaryKey(),
    username: varchar('username', { length: 50 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    role: mysqlEnum('role', ['FREE', 'MONTHLY', 'MOD', 'ADMIN']).notNull().default('FREE'),
    roleAssignedAt: timestamp('role_assigned_at'),
    paidAt: timestamp('paid_at'),
    monthlyExpiresAt: timestamp('monthly_expires_at'),
    articlesReadThisMonth: int('articles_read_this_month').notNull().default(0),
    articlesReadResetAt: timestamp('articles_read_reset_at').notNull().default('0000-00-00 00:00:00'),
    notificationCount: int('notification_count').notNull().default(0),
    emailVerified: mysqlEnum('email_verified', ['0', '1']).notNull().default('0'),
    verificationToken: varchar('verification_token', { length: 128 }),
    verificationExpiresAt: timestamp('verification_expires_at'),
    resetToken: varchar('reset_token', { length: 128 }),
    resetExpiresAt: timestamp('reset_expires_at'),
    googleId: varchar('google_id', { length: 128 }),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
    updatedAt: timestamp('updated_at').notNull().default('0000-00-00 00:00:00').onUpdateNow(),
  },
  (table) => [
    uniqueIndex('uk_eu_users_username').on(table.username),
    uniqueIndex('uk_eu_users_email').on(table.email),
    uniqueIndex('uk_eu_users_google_id').on(table.googleId),
    index('idx_eu_users_role').on(table.role),
    index('idx_eu_users_verification_token').on(table.verificationToken),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  articles: many(articles),
  articleEdits: many(articleEdits),
  notifications: many(notifications),
  adminLogs: many(adminLogs),
  paymentHistory: many(paymentHistory),
  rateLimitLogs: many(rateLimitLogs),
  sourceDownloads: many(sourceDownloads),
}));
