/**
 * Glossary fetcher for DQX translation terms.
 * Fetches the glossary CSV from the dqx-translation-project GitHub repo.
 */

import { parse } from "csv-parse";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/** Glossary entry for translation. */
interface GlossaryEntry {
	japanese_text: string;
	english_text: string;
}

const GLOSSARY_URL =
	"https://raw.githubusercontent.com/dqx-translation-project/dqx-custom-translations/main/csv/glossary.csv";

/**
 * Fetch and parse the glossary CSV from GitHub.
 */
export async function fetchGlossary(): Promise<GlossaryEntry[]> {
	const response = await fetch(GLOSSARY_URL, {
		headers: {
			"User-Agent": "DQX-News-Worker/1.0",
		},
	});

	if (!response.ok || !response.body) {
		throw new Error(`Failed to fetch glossary: ${response.status}`);
	}

	const body = Readable.fromWeb(
		response.body as unknown as NodeReadableStream,
	);
	const parser = body.pipe(
		parse({
			columns: ["ja", "en"],
			trim: true,
			skip_empty_lines: true,
		}),
	);

	const entries: GlossaryEntry[] = [];

	for await (const record of parser) {
		const japanese = record.ja as string;
		const english = record.en as string;

		// Skip empty entries or potential headers
		if (japanese && english && japanese !== "Japanese") {
			entries.push({
				japanese_text: japanese,
				english_text: english,
			});
		}
	}

	return entries;
}

/**
 * Format glossary entries for inclusion in a translation prompt.
 */
export function formatGlossaryForPrompt(entries: GlossaryEntry[]): string {
	if (entries.length === 0) return "";

	const lines = entries.map(
		(e) => `- "${e.japanese_text}" → "${e.english_text}"`,
	);

	return `
Use the following glossary for specific game terms and names:
${lines.join("\n")}
`;
}
