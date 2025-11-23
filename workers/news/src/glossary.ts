/**
 * Glossary fetcher for DQX translation terms.
 * Fetches the glossary CSV from the dqx-translation-project GitHub repo.
 */

import type { GlossaryEntry } from "./types";

const GLOSSARY_URL =
	"https://raw.githubusercontent.com/dqx-translation-project/dqx-custom-translations/main/csv/glossary.csv";

/**
 * Parse a CSV line, handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				// Escaped quote
				current += '"';
				i++;
			} else {
				// Toggle quote mode
				inQuotes = !inQuotes;
			}
		} else if (char === "," && !inQuotes) {
			fields.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}

	// Don't forget the last field
	fields.push(current.trim());

	return fields;
}

/**
 * Fetch and parse the glossary CSV from GitHub.
 */
export async function fetchGlossary(): Promise<GlossaryEntry[]> {
	const response = await fetch(GLOSSARY_URL, {
		headers: {
			"User-Agent": "DQX-News-Worker/1.0",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch glossary: ${response.status}`);
	}

	const csvText = await response.text();
	const lines = csvText.split("\n");
	const entries: GlossaryEntry[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const fields = parseCsvLine(trimmed);

		// Expect at least 2 fields: Japanese, English
		if (fields.length >= 2) {
			const japanese = fields[0];
			const english = fields[1];

			// Skip empty entries or potential headers
			if (japanese && english && japanese !== "Japanese") {
				entries.push({
					japanese_text: japanese,
					english_text: english,
				});
			}
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
		(e) => `- "${e.japanese_text}" → "${e.english_text}"`
	);

	return `
Use the following glossary for specific game terms and names:
${lines.join("\n")}
`;
}
