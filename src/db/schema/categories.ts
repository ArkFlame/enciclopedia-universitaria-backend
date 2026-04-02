import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  index,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

export const categories = mysqlTable(
  'eu_categories',
  {
    id: int('id').autoincrement().primaryKey(),
    slug: varchar('slug', { length: 100 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 7 }).notNull().default('#000000'),
    description: text('description'),
    sortOrder: int('sort_order').notNull().default(0),
    isActive: mysqlEnum('is_active', ['0', '1']).notNull().default('1'),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
    updatedAt: timestamp('updated_at').notNull().default('0000-00-00 00:00:00').onUpdateNow(),
  },
  (table) => [
    index('idx_eu_categories_slug').on(table.slug),
  ],
);

export const subcategories = mysqlTable(
  'eu_subcategories',
  {
    id: int('id').autoincrement().primaryKey(),
    categoryId: int('category_id').notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    sortOrder: int('sort_order').notNull().default(0),
    isActive: mysqlEnum('is_active', ['0', '1']).notNull().default('1'),
    createdAt: timestamp('created_at').notNull().default('0000-00-00 00:00:00'),
    updatedAt: timestamp('updated_at').notNull().default('0000-00-00 00:00:00').onUpdateNow(),
  },
  (table) => [
    index('idx_eu_subcategories_category_slug').on(table.categoryId, table.slug),
    foreignKey({
      name: 'fk_eu_subcategories_category',
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      onDelete: 'restrict',
    }),
  ],
);

export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
}));

export const subcategoriesRelations = relations(subcategories, ({ one }) => ({
  category: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
}));
