/**
 * Glossary table - stores translation term mappings.
 *
 * Used to ensure consistent translation of game-specific terms.
 * Composite primary key (sourceText, targetLanguage) allows
 * different translations for different target languages.
 */

import {
	sqliteTable,
	text,
	integer,
	primaryKey,
} from "drizzle-orm/sqlite-core";

export const glossary = sqliteTable(
	"glossary",
	{
		// Composite key components
		sourceText: text("source_text").notNull(), // Japanese term
		targetLanguage: text("target_language").notNull(), // e.g., "en"

		// Translation
		translatedText: text("translated_text").notNull(),

		// Tracking
		updatedAt: integer("updated_at").notNull(), // Unix timestamp
	},
	(table) => ({
		pk: primaryKey({
			columns: [table.sourceText, table.targetLanguage],
		}),
	}),
);

// Type exports
export type GlossaryEntry = typeof glossary.$inferSelect;
export type NewGlossaryEntry = typeof glossary.$inferInsert;
