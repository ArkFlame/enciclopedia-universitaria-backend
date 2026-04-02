import {
  mysqlTable,
  bigint,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  index,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const notifications = mysqlTable(
  'eu_notifications',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id').notNull(),
    type: mysqlEnum('type', [
      'article_approved',
      'article_rejected',
      'edit_approved',
      'edit_rejected',
      'subscription_expired',
      'subscription_activated',
      'new_submission',
    ]).notNull(),
    message: text('message').notNull(),
    referenceId: int('reference_id'),
    articleSlug: varchar('article_slug', { length: 255 }),
    notificationUrl: varchar('notification_url', { length: 500 }),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
  },
  (table) => [
    index('idx_eu_notifications_user_unread').on(table.userId, table.readAt),
    foreignKey({
      name: 'fk_eu_notifications_user',
      columns: [table.userId],
      foreignColumns: [users.id],
      onDelete: 'cascade',
    }),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
