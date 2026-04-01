const { mysqlTable, serial, varchar, text, int, timestamp, mysqlEnum, json, index, uniqueIndex } = require('drizzle-orm/mysql-core');
const { relations } = require('drizzle-orm');

const categories = mysqlTable('eu_categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  sortOrder: int('sort_order').notNull().default(0),
  isActive: mysqlEnum('is_active', ['0', '1']).notNull().default('1'),
  createdAt: timestamp('created_at').notNull().default(new Date()),
  updatedAt: timestamp('updated_at').notNull().default(new Date()).onUpdateNow(),
});

const subcategories = mysqlTable('eu_subcategories', {
  id: serial('id').primaryKey(),
  categoryId: int('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  sortOrder: int('sort_order').notNull().default(0),
  isActive: mysqlEnum('is_active', ['0', '1']).notNull().default('1'),
  createdAt: timestamp('created_at').notNull().default(new Date()),
  updatedAt: timestamp('updated_at').notNull().default(new Date()).onUpdateNow(),
}, (table) => ({
  categorySlugIdx: index('sub_cat_slug_idx').on(table.categoryId, table.slug),
}));

const articles = mysqlTable('eu_articles', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
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
  tags: json('tags'),
  views: int('views').notNull().default(0),
  version: int('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().default(new Date()),
  updatedAt: timestamp('updated_at').notNull().default(new Date()).onUpdateNow(),
}, (table) => ({
  statusIdx: index('art_status_idx').on(table.status),
  authorIdx: index('art_author_idx').on(table.authorId),
  createdIdx: index('art_created_idx').on(table.createdAt),
  categorySlugIdx: index('art_cat_idx').on(table.category),
}));

const users = mysqlTable('eu_users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: mysqlEnum('role', ['FREE', 'MONTHLY', 'MOD', 'ADMIN']).notNull().default('FREE'),
  roleAssignedAt: timestamp('role_assigned_at'),
  paidAt: timestamp('paid_at'),
  monthlyExpiresAt: timestamp('monthly_expires_at'),
  articlesReadThisMonth: int('articles_read_this_month').notNull().default(0),
  articlesReadResetAt: timestamp('articles_read_reset_at').notNull().default(new Date()),
  notificationCount: int('notification_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(new Date()),
  updatedAt: timestamp('updated_at').notNull().default(new Date()).onUpdateNow(),
});

const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
  articles: many(articles),
}));

const subcategoriesRelations = relations(subcategories, ({ one }) => ({
  category: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
}));

const articlesRelations = relations(articles, ({ one }) => ({
  category: one(categories, {
    fields: [articles.categoryId],
    references: [categories.id],
  }),
  subcategory: one(subcategories, {
    fields: [articles.subcategoryId],
    references: [subcategories.id],
  }),
  author: one(users, {
    fields: [articles.authorId],
    references: [users.id],
  }),
}));

/** @typedef {import('drizzle-orm').InferSelect<typeof categories>} Category */
/** @typedef {import('drizzle-orm').InferInsert<typeof categories>} NewCategory */
/** @typedef {import('drizzle-orm').InferSelect<typeof subcategories>} Subcategory */
/** @typedef {import('drizzle-orm').InferInsert<typeof subcategories>} NewSubcategory */
/** @typedef {import('drizzle-orm').InferSelect<typeof articles>} Article */
/** @typedef {import('drizzle-orm').InferInsert<typeof articles>} NewArticle */

module.exports = {
  categories,
  subcategories,
  articles,
  users,
  categoriesRelations,
  subcategoriesRelations,
  articlesRelations,
};
