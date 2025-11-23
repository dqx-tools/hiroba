/**
 * Image text translation using OpenAI vision.
 */

import OpenAI from "openai";

const TRANSLATION_PROMPT = `
Translate this image from Japanese to English. Please return values for the following pieces of text extracted from the
image (which may not be accurate to what you read, it's from a legacy OCR system and has lower accuracy than you do).
Return the result in the form of a JSON object where the keys are these original strings and the values are your
translated output. Return only JSON, do not include any other information. Do not wrap it in markdown. For context,
the image is an event banner image for Dragon Quest X, a popular MMORPG in Japan.
`;

/**
 * Calculate cosine similarity between two strings using character n-grams.
 */
function cosineSimilarity(s1: string, s2: string): number {
	const n = 2; // Use bigrams

	function getNGrams(s: string): Map<string, number> {
		const grams = new Map<string, number>();
		for (let i = 0; i <= s.length - n; i++) {
			const gram = s.substring(i, i + n);
			grams.set(gram, (grams.get(gram) || 0) + 1);
		}
		return grams;
	}

	const grams1 = getNGrams(s1);
	const grams2 = getNGrams(s2);

	// Calculate dot product
	let dotProduct = 0;
	for (const [gram, count] of grams1) {
		if (grams2.has(gram)) {
			dotProduct += count * grams2.get(gram)!;
		}
	}

	// Calculate magnitudes
	let mag1 = 0;
	for (const count of grams1.values()) {
		mag1 += count * count;
	}
	mag1 = Math.sqrt(mag1);

	let mag2 = 0;
	for (const count of grams2.values()) {
		mag2 += count * count;
	}
	mag2 = Math.sqrt(mag2);

	if (mag1 === 0 || mag2 === 0) return 0;
	return dotProduct / (mag1 * mag2);
}

/**
 * Find the best matching key in a dictionary using fuzzy matching.
 */
function fuzzyDictLookup(
	dictionary: Record<string, string>,
	key: string
): string {
	let bestMatch = { similarity: 0, value: "" };

	for (const dictKey of Object.keys(dictionary)) {
		const similarity = cosineSimilarity(key, dictKey);
		if (similarity > bestMatch.similarity) {
			bestMatch = { similarity, value: dictionary[dictKey] };
		}
	}

	return bestMatch.value;
}

/**
 * Normalize Unicode text using NFC normalization.
 */
function normalizeText(text: string): string {
	return text.normalize("NFC");
}

/**
 * Translates text in images using OpenAI vision.
 */
export class ImageTranslator {
	private client: OpenAI;
	private model: string;

	constructor(apiKey: string, model: string = "gpt-4o") {
		this.client = new OpenAI({ apiKey });
		this.model = model;
	}

	/**
	 * Translate a list of texts found in an image.
	 *
	 * Uses the image for context to produce more accurate translations
	 * of the OCR-detected text.
	 *
	 * @param imageDataUri - Base64 data URI of the source image
	 * @param texts - List of Japanese text strings to translate
	 * @returns Dictionary mapping original texts to translations
	 */
	async translateTexts(
		imageDataUri: string,
		texts: string[]
	): Promise<Record<string, string>> {
		// Normalize all texts
		const normalizedTexts = texts.map(normalizeText);

		const completion = await this.client.chat.completions.create({
			model: this.model,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: TRANSLATION_PROMPT },
				{
					role: "user",
					content: [
						{ type: "image_url", image_url: { url: imageDataUri } },
						{ type: "text", text: normalizedTexts.join("\n") },
					],
				},
			],
		});

		const content = completion.choices[0]?.message?.content;
		if (!content) {
			throw new Error("No translation response from OpenAI");
		}

		const translations = JSON.parse(content) as Record<string, string>;

		// Use fuzzy matching to handle OCR inconsistencies
		const result: Record<string, string> = {};
		for (const key of texts) {
			const normalizedKey = normalizeText(key);
			result[key] = fuzzyDictLookup(translations, normalizedKey);
		}

		return result;
	}
}
