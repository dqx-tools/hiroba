/**
 * Translation service using OpenAI.
 */

import OpenAI from "openai";
import {
	NewsCategory,
	CATEGORY_ENGLISH_NAMES,
	CATEGORY_JAPANESE_NAMES,
	type NewsItem,
	type NewsDetail,
	type TranslatedNewsItem,
	type TranslatedNewsDetail,
	type GlossaryEntry,
} from "./types";
import { formatGlossaryForPrompt } from "./glossary";

const TITLE_SYSTEM_PROMPT = `You are a professional translator specializing in Japanese video game content,
particularly Dragon Quest X (DQX) online game. Translate the following Japanese text to natural English.
Keep game-specific terms, item names, and location names that players would recognize.
Be concise but accurate.`;

const CONTENT_SYSTEM_PROMPT = `You are a professional translator specializing in Japanese video game content,
particularly Dragon Quest X (DQX) online game. Translate the following Japanese text to natural English.

Guidelines:
- Keep game-specific terms, item names, location names, and character names that players would recognize
- Preserve any formatting like bullet points, numbered lists, dates, and times
- Convert Japanese date/time formats to be internationally readable while keeping original values
- Keep URLs and technical identifiers unchanged
- Maintain the original tone (official announcements should sound official)
- If there are instructions or steps, ensure they remain clear and actionable`;

/**
 * Compute SHA-256 hash of content for cache invalidation.
 */
export async function computeContentHash(content: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	return hashHex.slice(0, 16);
}

/**
 * Translator for DQX news using OpenAI.
 */
export class DQXTranslator {
	private client: OpenAI;
	private model: string;

	constructor(apiKey: string, model: string = "gpt-4.5-preview") {
		this.client = new OpenAI({ apiKey });
		this.model = model;
	}

	/**
	 * Translate a news title.
	 */
	async translateTitle(
		title: string,
		glossaryEntries?: GlossaryEntry[]
	): Promise<string> {
		if (!title.trim()) return "";

		const glossaryPrompt = formatGlossaryForPrompt(glossaryEntries ?? []);
		const systemPrompt = glossaryPrompt
			? `${TITLE_SYSTEM_PROMPT}\n${glossaryPrompt}`
			: TITLE_SYSTEM_PROMPT;

		const response = await this.client.chat.completions.create({
			model: this.model,
			temperature: 0.3,
			messages: [
				{ role: "system", content: systemPrompt },
				{
					role: "user",
					content: `Translate this Japanese title to English:\n\n${title}`,
				},
			],
		});

		return response.choices[0]?.message?.content?.trim() ?? "";
	}

	/**
	 * Translate news content.
	 */
	async translateContent(
		content: string,
		glossaryEntries?: GlossaryEntry[]
	): Promise<string> {
		if (!content.trim()) return "";

		const glossaryPrompt = formatGlossaryForPrompt(glossaryEntries ?? []);
		const systemPrompt = glossaryPrompt
			? `${CONTENT_SYSTEM_PROMPT}\n${glossaryPrompt}`
			: CONTENT_SYSTEM_PROMPT;

		const response = await this.client.chat.completions.create({
			model: this.model,
			temperature: 0.3,
			messages: [
				{ role: "system", content: systemPrompt },
				{
					role: "user",
					content: `Translate this Japanese content to English:\n\n${content}`,
				},
			],
		});

		return response.choices[0]?.message?.content?.trim() ?? "";
	}

	/**
	 * Translate a news listing item.
	 */
	async translateNewsItem(
		item: NewsItem,
		glossaryEntries?: GlossaryEntry[]
	): Promise<TranslatedNewsItem> {
		const titleEn = await this.translateTitle(item.title, glossaryEntries);

		return {
			id: item.id,
			titleJa: item.title,
			titleEn,
			date: item.date,
			url: item.url,
			category: CATEGORY_ENGLISH_NAMES[item.category],
			categoryJa: CATEGORY_JAPANESE_NAMES[item.category],
		};
	}

	/**
	 * Translate a full news article.
	 */
	async translateNewsDetail(
		detail: NewsDetail,
		cachedTranslation?: string,
		glossaryEntries?: GlossaryEntry[]
	): Promise<TranslatedNewsDetail> {
		const titleEn = await this.translateTitle(detail.title, glossaryEntries);
		const contentHash = await computeContentHash(detail.contentText);

		// Use cached translation if content hasn't changed
		const contentEn = cachedTranslation
			? cachedTranslation
			: await this.translateContent(detail.contentText, glossaryEntries);

		return {
			id: detail.id,
			titleJa: detail.title,
			titleEn,
			date: detail.date,
			url: detail.url,
			category: CATEGORY_ENGLISH_NAMES[detail.category],
			categoryJa: CATEGORY_JAPANESE_NAMES[detail.category],
			contentJa: detail.contentText,
			contentEn,
			contentHash,
		};
	}
}
