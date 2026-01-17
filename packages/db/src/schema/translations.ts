/**
 * Translations table and AI translation service.
 *
 * Uses a composite primary key (itemType, itemId, language, field) to support:
 * - Multiple content types (news, topics, events)
 * - Multiple languages per item
 * - Different translatable fields per item type
 *
 * Includes single-flight concurrency control to prevent duplicate
 * translation API calls when multiple workers request the same translation.
 */

import {
	sqliteTable,
	text,
	integer,
	primaryKey,
} from "drizzle-orm/sqlite-core";
import { eq, and, or, lt, isNull, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { findMatchingGlossaryEntries } from "./glossary";
import { LOCK_CONFIG, isTranslationStale, translateWithAI } from "@hiroba/shared";

export const translations = sqliteTable(
	"translations",
	{
		// Composite key components
		itemType: text("item_type").notNull(), // "news", "topic", or "event"
		itemId: text("item_id").notNull(), // FK to news_items.id, topics.id, or events.id
		language: text("language").notNull(), // e.g., "en"
		field: text("field").notNull(), // e.g., "title", "content"

		// Translated value
		value: text("value").notNull(),

		// Tracking
		translatedAt: integer("translated_at").notNull(), // Unix timestamp
		model: text("model"), // AI model used for translation (e.g., "gpt-4o")

		// Concurrency lock for translation-in-progress
		translatingSince: integer("translating_since"), // Unix timestamp
	},
	(table) => ({
		pk: primaryKey({
			columns: [table.itemType, table.itemId, table.language, table.field],
		}),
	}),
);

// Type exports
export type Translation = typeof translations.$inferSelect;
export type NewTranslation = typeof translations.$inferInsert;
export type ItemType = "news" | "topic" | "event";
export type TranslationField = "title" | "content";

/** Result for a single translated field */
export interface FieldTranslation {
	value: string;
	translatedAt: number;
	model: string | null;
}

/** Map of field name to translation result */
export type FieldTranslations = Partial<Record<string, FieldTranslation>>;

/**
 * Get or create translations for an item's fields.
 * Uses single-flight pattern to prevent concurrent translations.
 *
 * @param sourceFields - Map of field names to source text (e.g., { title: "...", content: "..." })
 * @returns Map of field names to translated values
 */
export async function getOrCreateTranslation(
	db: Database,
	itemId: string,
	itemType: ItemType,
	language: string,
	sourceFields: Record<string, string>,
	publishedAt: number,
	aiApiKey: string,
): Promise<FieldTranslations> {
	const fieldNames = Object.keys(sourceFields);
	if (fieldNames.length === 0) {
		return {};
	}

	// Check for existing translations
	const existing = await db
		.select()
		.from(translations)
		.where(
			and(
				eq(translations.itemType, itemType),
				eq(translations.itemId, itemId),
				eq(translations.language, language),
				inArray(translations.field, fieldNames),
			),
		)
		.all();

	// Build map of existing translations
	const existingByField = new Map(existing.map((t) => [t.field, t]));

	// Find fields that need translation (missing or stale)
	const fieldsToTranslate: string[] = [];
	const result: FieldTranslations = {};

	for (const field of fieldNames) {
		const ex = existingByField.get(field);
		if (ex && !isTranslationStale(publishedAt, ex.translatedAt)) {
			// Use existing translation
			result[field] = {
				value: ex.value,
				translatedAt: ex.translatedAt,
				model: ex.model,
			};
		} else {
			fieldsToTranslate.push(field);
		}
	}

	// If all fields are cached and fresh, return early
	if (fieldsToTranslate.length === 0) {
		return result;
	}

	// Try to claim the translation lock (on title field as the "lock holder")
	const lockField = fieldsToTranslate[0];
	const now = Math.floor(Date.now() / 1000);
	const staleThreshold = now - Math.floor(LOCK_CONFIG.translationStaleThreshold / 1000);

	const claimed = await tryClaimTranslationLock(
		db,
		itemId,
		itemType,
		language,
		lockField,
		now,
		staleThreshold,
		existingByField.has(lockField),
	);

	if (claimed) {
		try {
			// Build source text for glossary matching
			const combinedSource = Object.values(sourceFields).join(" ");
			const glossaryTerms = await findMatchingGlossaryEntries(db, combinedSource, language);

			// Build map of fields to translate
			const fieldsForAI: Record<string, string> = {};
			for (const field of fieldsToTranslate) {
				fieldsForAI[field] = sourceFields[field];
			}

			// Do AI translation
			const translated = await translateWithAI(
				fieldsForAI,
				language,
				glossaryTerms,
				aiApiKey,
			);

			// Save all translated fields
			for (const field of fieldsToTranslate) {
				const value = translated.fields[field] ?? sourceFields[field];
				await db
					.insert(translations)
					.values({
						itemType,
						itemId,
						language,
						field,
						value,
						translatedAt: now,
						model: translated.model,
						translatingSince: null,
					})
					.onConflictDoUpdate({
						target: [translations.itemType, translations.itemId, translations.language, translations.field],
						set: {
							value,
							translatedAt: now,
							model: translated.model,
							translatingSince: null,
						},
					});

				result[field] = {
					value,
					translatedAt: now,
					model: translated.model,
				};
			}

			return result;
		} catch (error) {
			// Release lock on error
			await releaseTranslationLock(db, itemId, itemType, language, lockField);
			throw error;
		}
	}

	// Someone else is translating, poll until done
	const polled = await pollForTranslation(db, itemId, itemType, language, fieldsToTranslate);
	return { ...result, ...polled };
}

/**
 * Delete all translations for an item.
 */
export async function deleteTranslation(
	db: Database,
	itemId: string,
	language: string,
	itemType: ItemType = "news",
): Promise<boolean> {
	const result = await db
		.delete(translations)
		.where(
			and(
				eq(translations.itemType, itemType),
				eq(translations.itemId, itemId),
				eq(translations.language, language),
			),
		)
		.returning({ itemId: translations.itemId });

	return result.length > 0;
}

/**
 * Try to claim the translation lock using atomic update.
 */
async function tryClaimTranslationLock(
	db: Database,
	itemId: string,
	itemType: string,
	language: string,
	field: string,
	now: number,
	staleThreshold: number,
	exists: boolean,
): Promise<boolean> {
	if (exists) {
		// Update existing record to claim lock
		const result = await db
			.update(translations)
			.set({ translatingSince: now })
			.where(
				and(
					eq(translations.itemType, itemType),
					eq(translations.itemId, itemId),
					eq(translations.language, language),
					eq(translations.field, field),
					or(
						isNull(translations.translatingSince),
						lt(translations.translatingSince, staleThreshold),
					),
				),
			)
			.returning({ itemId: translations.itemId });

		return result.length > 0;
	} else {
		// Insert new record with lock
		try {
			await db.insert(translations).values({
				itemType,
				itemId,
				language,
				field,
				value: "",
				translatedAt: 0,
				translatingSince: now,
			});
			return true;
		} catch {
			// Conflict - someone else inserted first
			return false;
		}
	}
}

/**
 * Release translation lock on error.
 */
async function releaseTranslationLock(
	db: Database,
	itemId: string,
	itemType: string,
	language: string,
	field: string,
): Promise<void> {
	await db
		.update(translations)
		.set({ translatingSince: null })
		.where(
			and(
				eq(translations.itemType, itemType),
				eq(translations.itemId, itemId),
				eq(translations.language, language),
				eq(translations.field, field),
			),
		);
}

/**
 * Poll database waiting for another worker to complete translation.
 */
async function pollForTranslation(
	db: Database,
	itemId: string,
	itemType: string,
	language: string,
	fields: string[],
): Promise<FieldTranslations> {
	const maxWait = LOCK_CONFIG.translationMaxWait;
	const pollInterval = LOCK_CONFIG.translationPollInterval;
	const startTime = Date.now();

	while (Date.now() - startTime < maxWait) {
		await sleep(pollInterval);

		const results = await db
			.select()
			.from(translations)
			.where(
				and(
					eq(translations.itemType, itemType),
					eq(translations.itemId, itemId),
					eq(translations.language, language),
					inArray(translations.field, fields),
				),
			)
			.all();

		// Check if all fields are complete (have value and lock released)
		const complete = results.filter(
			(r) => r.value && r.translatingSince === null
		);

		if (complete.length === fields.length) {
			const result: FieldTranslations = {};
			for (const row of complete) {
				result[row.field] = {
					value: row.value,
					translatedAt: row.translatedAt,
					model: row.model,
				};
			}
			return result;
		}
	}

	throw new Error("Timeout waiting for translation");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
