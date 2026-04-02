import {
  mysqlTable,
  bigint,
  varchar,
  text,
  int,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const articles = mysqlTable(
  'eu_articles',
  {
    id: int('id').autoincrement().primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    summary: text('summary').notNull(),
    contentPath: varchar('content_path', { length: 500 }).notNull(),
    authorId: int('author_id').notNull(),
    status: mysqlEnum('status', ['PENDING', 'APPROVED', 'REJECTED']).notNull().default('PENDING'),
    reviewedBy: int('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    category: varchar('category', { length: 100 }),
    subcategory: varchar('subcategory', { length: 100 }),
    categoryId: int('category_id'),
    subcategoryId: int('subcategory_id'),
    coverImageUrl: varchar('cover_image_url', { length: 500 }),
    coverImageId: int('cover_image_id'),
    tags: text('tags'),
    sourcesCount: int('sources_count').notNull().default(0),
    views: int('views').notNull().default(0),
    version: int('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
    updatedAt: timestamp('updated_at').notNull().default('0000-00-00 00:00:00').onUpdateNow(),
  },
  (table) => [
    uniqueIndex('uk_eu_articles_slug').on(table.slug),
    index('idx_eu_articles_status').on(table.status),
    index('idx_eu_articles_author').on(table.authorId),
    index('idx_eu_articles_created').on(table.createdAt),
    index('idx_eu_articles_category').on(table.category),
    foreignKey({
      name: 'fk_eu_articles_author',
      columns: [table.authorId],
      foreignColumns: [users.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      name: 'fk_eu_articles_reviewer',
      columns: [table.reviewedBy],
      foreignColumns: [users.id],
      onDelete: 'set null',
    }),
    foreignKey({
      name: 'fk_eu_articles_cover_image',
      columns: [table.coverImageId],
      foreignColumns: ['eu_media.id'],
      onDelete: 'set null',
    }),
  ],
);

export const articleEdits = mysqlTable(
  'eu_article_edits',
  {
    id: int('id').autoincrement().primaryKey(),
    articleId: int('article_id').notNull(),
    editorId: int('editor_id').notNull(),
    title: varchar('title', { length: 500 }),
    summary: text('summary'),
    contentPath: varchar('content_path', { length: 500 }),
    editNote: text('edit_note'),
    category: varchar('category', { length: 100 }),
    subcategory: varchar('subcategory', { length: 100 }),
    categoryId: int('category_id'),
    subcategoryId: int('subcategory_id'),
    status: mysqlEnum('status', ['PENDING', 'APPROVED', 'REJECTED']).notNull().default('PENDING'),
    reviewedBy: int('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
  },
  (table) => [
    index('idx_eu_article_edits_article_status').on(table.articleId, table.status),
    index('idx_eu_article_edits_editor').on(table.editorId),
    foreignKey({
      name: 'fk_eu_ae_article',
      columns: [table.articleId],
      foreignColumns: [articles.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      name: 'fk_eu_ae_editor',
      columns: [table.editorId],
      foreignColumns: [users.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      name: 'fk_eu_ae_reviewer',
      columns: [table.reviewedBy],
      foreignColumns: [users.id],
      onDelete: 'set null',
    }),
  ],
);

export const articleSources = mysqlTable(
  'eu_article_sources',
  {
    id: int('id').autoincrement().primaryKey(),
    articleId: int('article_id').notNull(),
    type: mysqlEnum('type', ['link', 'pdf']).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    url: varchar('url', { length: 2000 }),
    pdfPath: varchar('pdf_path', { length: 1000 }),
    pdfOriginalName: varchar('pdf_original_name', { length: 500 }),
    pdfSize: bigint('pdf_size', { unsigned: true }).default(0),
    faviconUrl: varchar('favicon_url', { length: 500 }),
    displayOrder: int('display_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
    updatedAt: timestamp('updated_at').notNull().default('0000-00-00 00:00:00').onUpdateNow(),
  },
  (table) => [
    index('idx_eu_article_sources_article').on(table.articleId),
    index('idx_eu_article_sources_type').on(table.type),
    index('idx_eu_article_sources_order').on(table.displayOrder),
    foreignKey({
      name: 'fk_eu_article_sources_article',
      columns: [table.articleId],
      foreignColumns: [articles.id],
      onDelete: 'cascade',
    }),
  ],
);

export const sourceDownloads = mysqlTable(
  'eu_source_downloads',
  {
    id: int('id').autoincrement().primaryKey(),
    sourceId: int('source_id').notNull(),
    userId: int('user_id'),
    ipAddress: varchar('ip_address', { length: 45 }),
    downloadedAt: timestamp('downloaded_at').notNull().default('0000-00-00 00:00:00'),
  },
  (table) => [
    index('idx_eu_source_downloads_source').on(table.sourceId),
    index('idx_eu_source_downloads_user').on(table.userId),
    index('idx_eu_source_downloads_ip').on(table.ipAddress),
    index('idx_eu_source_downloads_date').on(table.downloadedAt),
    foreignKey({
      name: 'fk_eu_source_downloads_source',
      columns: [table.sourceId],
      foreignColumns: [articleSources.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      name: 'fk_eu_source_downloads_user',
      columns: [table.userId],
      foreignColumns: [users.id],
      onDelete: 'set null',
    }),
  ],
);

export const articlesRelations = relations(articles, ({ one, many }) => ({
  author: one(users, {
    fields: [articles.authorId],
    references: [users.id],
  }),
  reviewedByUser: one(users, {
    fields: [articles.reviewedBy],
    references: [users.id],
  }),
  edits: many(articleEdits),
  sources: many(articleSources),
}));

export const articleEditsRelations = relations(articleEdits, ({ one }) => ({
  article: one(articles, {
    fields: [articleEdits.articleId],
    references: [articles.id],
  }),
  editor: one(users, {
    fields: [articleEdits.editorId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [articleEdits.reviewedBy],
    references: [users.id],
  }),
}));

export const articleSourcesRelations = relations(articleSources, ({ one, many }) => ({
  article: one(articles, {
    fields: [articleSources.articleId],
    references: [articles.id],
  }),
  downloads: many(sourceDownloads),
}));

export const sourceDownloadsRelations = relations(sourceDownloads, ({ one }) => ({
  source: one(articleSources, {
    fields: [sourceDownloads.sourceId],
    references: [articleSources.id],
  }),
  user: one(users, {
    fields: [sourceDownloads.userId],
    references: [users.id],
  }),
}));
