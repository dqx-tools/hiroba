/**
 * Font detection and mapping to Latin equivalents.
 */

import OpenAI from "openai";

/**
 * Explicit mappings for known Japanese fonts to Latin equivalents.
 */
const FONT_MAPPINGS: Record<string, string> = {
	"ライラ": "Laila",
	Kurokane: "Black Han Sans",
	Seurat: "Nunito",
	GMaruGo: "Nunito",
	TelopMin: "Sorts Mill Goudy",
	LapisEdge: "Roboto",
	NewCezanne: "Roboto",
};

const FONT_ANALOGUE_PROMPT = `
Please find a similar font with support for the Latin alphabet, available on Google Fonts. Try to
match style as best as you can, don't just cop out and say "Open Sans". It may help to think about
this font's unique attributes, style, and whatnot. Remember that the font doesn't need to be
Latin-first, just have support for Latin. Respond with nothing but the font name, and don't include
any other information or quotes.
`;

/**
 * Maps Japanese fonts to Latin equivalents using OpenAI.
 */
export class FontMapper {
	private client: OpenAI;
	private model: string;

	constructor(apiKey: string, model: string = "gpt-4o-mini") {
		this.client = new OpenAI({ apiKey });
		this.model = model;
	}

	/**
	 * Get a Latin-compatible equivalent font for a Japanese font.
	 *
	 * @param fontName - The detected Japanese font name, or null
	 * @returns Name of a Latin-compatible Google Font
	 */
	async getLatinEquivalent(fontName: string | null): Promise<string> {
		if (fontName === null) {
			return "Open Sans";
		}

		// Check explicit mappings first
		for (const [key, value] of Object.entries(FONT_MAPPINGS)) {
			if (fontName.includes(key)) {
				return value;
			}
		}

		// Fall back to OpenAI for unknown fonts
		const completion = await this.client.chat.completions.create({
			model: this.model,
			messages: [
				{ role: "user", content: FONT_ANALOGUE_PROMPT },
				{ role: "user", content: fontName },
			],
		});

		return completion.choices[0]?.message?.content?.trim() ?? "Open Sans";
	}
}
