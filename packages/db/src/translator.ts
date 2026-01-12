/**
 * AI translation service with single-flight concurrency control.
 *
 * Prevents duplicate translation API calls when multiple workers
 * request the same translation simultaneously.
 */

import { eq, and, or, lt, isNull, sql } from "drizzle-orm";
import { translations } from "./schema/translations";
import { glossary } from "./schema/glossary";
import type { Database } from "./client";
import { LOCK_CONFIG, isTranslationStale } from "@hiroba/shared";
import OpenAI from "openai";

export interface TranslationResult {
	title: string;
	content: string;
	translatedAt: number;
}

const SYSTEM_PROMPT = `You are a professional translator specializing in Japanese video game content,
particularly Dragon Quest X (DQX) online game. Translate the following Japanese text to natural English.

Guidelines:
- Keep game-specific terms, item names, location names, and character names that players would recognize
- Preserve any formatting like bullet points, numbered lists, dates, and times
- Convert Japanese date/time formats to be internationally readable while keeping original values
- Keep URLs and technical identifiers unchanged
- Maintain the original tone (official announcements should sound official)
- If there are instructions or steps, ensure they remain clear and actionable

Return your translation in the following JSON format:
{"title": "translated title", "content": "translated content"}`;

/**
 * Get or create translation for a news item.
 * Uses single-flight pattern to prevent concurrent translations.
 */
export async function getOrCreateTranslation(
	db: Database,
	itemId: string,
	itemType: "news" | "topic",
	language: string,
	sourceTitle: string,
	sourceContent: string,
	publishedAt: number,
	aiApiKey: string,
): Promise<TranslationResult> {
	// Check for existing translation
	const existing = await db
		.select()
		.from(translations)
		.where(
			and(
				eq(translations.itemType, itemType),
				eq(translations.itemId, itemId),
				eq(translations.language, language),
			),
		)
		.get();

	// If exists and not stale, return it
	if (existing && !isTranslationStale(publishedAt, existing.translatedAt)) {
		return {
			title: existing.title,
			content: existing.content,
			translatedAt: existing.translatedAt,
		};
	}

	// Try to claim the translation lock
	const now = Math.floor(Date.now() / 1000);
	const staleThreshold = now - Math.floor(LOCK_CONFIG.translationStaleThreshold / 1000);

	const claimed = await tryClaimTranslationLock(
		db,
		itemId,
		itemType,
		language,
		now,
		staleThreshold,
		existing !== undefined,
	);

	if (claimed) {
		try {
			// Fetch only glossary entries that appear in the source text
			const combinedSource = `${sourceTitle} ${sourceContent}`;
			const glossaryEntries = await db
				.select({
					sourceText: glossary.sourceText,
					translatedText: glossary.translatedText,
				})
				.from(glossary)
				.where(
					and(
						eq(glossary.targetLanguage, language),
						sql`instr(${combinedSource}, ${glossary.sourceText}) > 0`,
					),
				)
				.all();

			// Do AI translation
			const translated = await translateWithAI(
				sourceTitle,
				sourceContent,
				language,
				glossaryEntries,
				aiApiKey,
			);

			// Save translation
			await db
				.insert(translations)
				.values({
					itemType,
					itemId,
					language,
					title: translated.title,
					content: translated.content,
					translatedAt: now,
					translatingSince: null,
				})
				.onConflictDoUpdate({
					target: [translations.itemType, translations.itemId, translations.language],
					set: {
						title: translated.title,
						content: translated.content,
						translatedAt: now,
						translatingSince: null,
					},
				});

			return { ...translated, translatedAt: now };
		} catch (error) {
			// Release lock on error
			await releaseTranslationLock(db, itemId, itemType, language);
			throw error;
		}
	}

	// Someone else is translating, poll until done
	return pollForTranslation(db, itemId, itemType, language);
}

/**
 * Try to claim the translation lock using atomic update.
 */
async function tryClaimTranslationLock(
	db: Database,
	itemId: string,
	itemType: string,
	language: string,
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
				title: "",
				content: "",
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
): Promise<void> {
	await db
		.update(translations)
		.set({ translatingSince: null })
		.where(
			and(
				eq(translations.itemType, itemType),
				eq(translations.itemId, itemId),
				eq(translations.language, language),
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
): Promise<TranslationResult> {
	const maxWait = LOCK_CONFIG.translationMaxWait;
	const pollInterval = LOCK_CONFIG.translationPollInterval;
	const startTime = Date.now();

	while (Date.now() - startTime < maxWait) {
		await sleep(pollInterval);

		const result = await db
			.select()
			.from(translations)
			.where(
				and(
					eq(translations.itemType, itemType),
					eq(translations.itemId, itemId),
					eq(translations.language, language),
				),
			)
			.get();

		// Translation is complete (has content and lock released)
		if (result && result.content && result.translatingSince === null) {
			return {
				title: result.title,
				content: result.content,
				translatedAt: result.translatedAt,
			};
		}
	}

	throw new Error("Timeout waiting for translation");
}

/**
 * Call OpenAI API to translate content.
 */
async function translateWithAI(
	title: string,
	content: string,
	targetLanguage: string,
	glossaryEntries: { sourceText: string; translatedText: string }[],
	apiKey: string,
): Promise<{ title: string; content: string }> {
	const client = new OpenAI({ apiKey });

	// Build glossary context
	const glossaryContext =
		glossaryEntries.length > 0
			? `\n\nGlossary (use these exact translations):\n${glossaryEntries.map((e) => `- ${e.sourceText} → ${e.translatedText}`).join("\n")}`
			: "";

	const userMessage = `Translate to ${targetLanguage}:
${glossaryContext}

Title: ${title}

Content:
${content}`;

	const response = await client.chat.completions.create({
		model: "gpt-4o",
		temperature: 0.3,
		response_format: { type: "json_object" },
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: userMessage },
		],
	});

	const responseText = response.choices[0]?.message?.content ?? "{}";

	try {
		const parsed = JSON.parse(responseText) as { title?: string; content?: string };
		return {
			title: parsed.title ?? title,
			content: parsed.content ?? content,
		};
	} catch {
		// Fallback: treat response as plain translated content
		return {
			title: title,
			content: responseText,
		};
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
