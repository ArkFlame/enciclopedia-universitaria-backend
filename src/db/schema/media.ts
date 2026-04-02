import {
  mysqlTable,
  bigint,
  varchar,
  int,
  timestamp,
  index,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const media = mysqlTable(
  'eu_media',
  {
    id: int('id').autoincrement().primaryKey(),
    articleId: int('article_id'),
    uploaderId: int('uploader_id').notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: int('size_bytes').notNull(),
    width: int('width'),
    height: int('height'),
    filePath: varchar('file_path', { length: 500 }).notNull(),
    publicUrl: varchar('public_url', { length: 500 }).notNull(),
    displayOrder: int('display_order').notNull().default(0),
    fileSize: bigint('file_size', { unsigned: true }).default(0),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
  },
  (table) => [
    index('idx_eu_media_article').on(table.articleId),
    index('idx_eu_media_uploader').on(table.uploaderId),
    foreignKey({
      name: 'fk_eu_media_article',
      columns: [table.articleId],
      foreignColumns: ['eu_articles.id'],
      onDelete: 'set null',
    }),
    foreignKey({
      name: 'fk_eu_media_uploader',
      columns: [table.uploaderId],
      foreignColumns: [users.id],
      onDelete: 'cascade',
    }),
  ],
);

export const mediaRelations = relations(media, ({ one }) => ({
  article: one(media, {
    fields: [media.articleId],
    references: [media.id],
    relationName: 'articleCover',
  }),
  uploader: one(users, {
    fields: [media.uploaderId],
    references: [users.id],
  }),
}));
