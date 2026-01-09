/**
 * Translations table - stores translated content for news items.
 *
 * Uses a composite primary key (itemType, itemId, language) to support:
 * - Multiple content types (news, topics in future)
 * - Multiple languages per item
 */

import {
	sqliteTable,
	text,
	integer,
	primaryKey,
} from "drizzle-orm/sqlite-core";

export const translations = sqliteTable(
	"translations",
	{
		// Composite key components
		itemType: text("item_type").notNull(), // "news" or "topic"
		itemId: text("item_id").notNull(), // FK to news_items.id or topics.id
		language: text("language").notNull(), // e.g., "en"

		// Translated content
		title: text("title").notNull(),
		content: text("content").notNull(),

		// Tracking
		translatedAt: integer("translated_at").notNull(), // Unix timestamp

		// Concurrency lock for translation-in-progress
		translatingSince: integer("translating_since"), // Unix timestamp
	},
	(table) => ({
		pk: primaryKey({
			columns: [table.itemType, table.itemId, table.language],
		}),
	}),
);

// Type exports
export type Translation = typeof translations.$inferSelect;
export type NewTranslation = typeof translations.$inferInsert;
