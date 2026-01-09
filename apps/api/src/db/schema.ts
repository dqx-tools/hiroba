/**
 * Drizzle ORM schema for DQX News D1 database.
 */

import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";


export const newsItems = sqliteTable("news_items", {
	newsId: text("news_id").primaryKey(),
});
/**
 * News translations table - stores translated news items.
 */
export const newsTranslations = sqliteTable(
	"news_translations",
	{
		newsId: text("news_id").primaryKey(),
		contentHash: text("content_hash").notNull(),
		titleJa: text("title_ja").notNull(),
		titleEn: text("title_en").notNull(),
		contentJa: text("content_ja"),
		contentEn: text("content_en"),
		category: text("category").notNull(),
		date: text("date").notNull(),
		url: text("url").notNull(),
		createdAt: text("created_at")
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text("updated_at")
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
	},
	(table) => ({
		categoryIdx: index("idx_news_category").on(table.category),
		dateIdx: index("idx_news_date").on(table.date),
		updatedIdx: index("idx_news_updated").on(table.updatedAt),
	})
);

/**
 * Translation locks table - prevents duplicate API calls for the same news item.
 */
export const translationLocks = sqliteTable("translation_locks", {
	newsId: text("news_id").primaryKey(),
	lockedAt: text("locked_at").notNull(),
});

/**
 * Glossary table - stores translation glossary entries.
 */
export const glossary = sqliteTable(
	"glossary",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		japaneseText: text("japanese_text").notNull().unique(),
		englishText: text("english_text").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => ({
		japaneseIdx: index("idx_glossary_japanese").on(table.japaneseText),
	})
);

export type NewsTranslation = typeof newsTranslations.$inferSelect;
export type NewNewsTranslation = typeof newsTranslations.$inferInsert;
export type TranslationLock = typeof translationLocks.$inferSelect;
export type NewTranslationLock = typeof translationLocks.$inferInsert;
export type GlossaryEntry = typeof glossary.$inferSelect;
export type NewGlossaryEntry = typeof glossary.$inferInsert;
