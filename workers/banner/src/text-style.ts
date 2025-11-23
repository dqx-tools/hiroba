/**
 * Text style extraction from image regions.
 */

import OpenAI from "openai";
import type { TextStyle, RGB, BoundingBox } from "./types";
import { getRectifiedDimensions } from "./image-utils";

const STYLE_PROMPT = `
Describe the text styling in this image. Respond in the form of a JSON object with keys for the text
foreground color, the text border/drop shadow color, and approximate font weight. Provide the colors
as hex codes, and font weight as a number from 100-900. Respond only with JSON. Do not analyze, do
it yourself.
`;

const STYLE_RESPONSE_FORMAT = {
	type: "json_schema" as const,
	json_schema: {
		name: "text_style",
		schema: {
			type: "object",
			properties: {
				foreground_color: {
					type: "string",
					description: "The foreground color of the text",
				},
				border_color: {
					type: "string",
					description: "The text border or drop shadow color.",
				},
				font_weight: {
					type: "integer",
					description: "The approximate font weight of the text",
					minimum: 100,
					maximum: 900,
				},
			},
			required: ["foreground_color", "border_color", "font_weight"],
		},
	},
};

/**
 * Simple K-means clustering implementation.
 */
function kMeans(
	points: number[][],
	k: number,
	maxIterations: number = 10
): { centroids: number[][]; labels: number[] } {
	if (points.length === 0) {
		return { centroids: [], labels: [] };
	}

	const dim = points[0].length;

	// Initialize centroids randomly from points
	const indices = new Set<number>();
	while (indices.size < k && indices.size < points.length) {
		indices.add(Math.floor(Math.random() * points.length));
	}
	let centroids = Array.from(indices).map((i) => [...points[i]]);

	let labels = new Array(points.length).fill(0);

	for (let iter = 0; iter < maxIterations; iter++) {
		// Assign points to nearest centroid
		const newLabels = points.map((point) => {
			let minDist = Infinity;
			let minLabel = 0;
			for (let c = 0; c < centroids.length; c++) {
				let dist = 0;
				for (let d = 0; d < dim; d++) {
					dist += Math.pow(point[d] - centroids[c][d], 2);
				}
				if (dist < minDist) {
					minDist = dist;
					minLabel = c;
				}
			}
			return minLabel;
		});

		// Check for convergence
		let changed = false;
		for (let i = 0; i < labels.length; i++) {
			if (labels[i] !== newLabels[i]) {
				changed = true;
				break;
			}
		}
		labels = newLabels;

		if (!changed) break;

		// Update centroids
		const newCentroids: number[][] = [];
		for (let c = 0; c < k; c++) {
			const clusterPoints = points.filter((_, i) => labels[i] === c);
			if (clusterPoints.length > 0) {
				const centroid = new Array(dim).fill(0);
				for (const point of clusterPoints) {
					for (let d = 0; d < dim; d++) {
						centroid[d] += point[d];
					}
				}
				for (let d = 0; d < dim; d++) {
					centroid[d] /= clusterPoints.length;
				}
				newCentroids.push(centroid);
			} else {
				newCentroids.push(centroids[c]);
			}
		}
		centroids = newCentroids;
	}

	return { centroids, labels };
}

/**
 * Extract dominant colors from image pixel data using K-means clustering.
 *
 * Note: In Cloudflare Workers we can't decode the actual pixels from a base64 image
 * without additional libraries. This function is provided for completeness but
 * the style extractor will rely primarily on the OpenAI vision model.
 */
export function getDominantColors(pixels: RGB[], numColors: number = 5): RGB[] {
	if (pixels.length === 0) {
		return [];
	}

	const points = pixels.map((rgb) => [rgb[0], rgb[1], rgb[2]]);
	const { centroids, labels } = kMeans(points, numColors);

	// Count pixels per cluster
	const counts = new Map<number, number>();
	for (const label of labels) {
		counts.set(label, (counts.get(label) || 0) + 1);
	}

	// Sort by frequency
	const indexed = centroids.map((c, i) => ({
		color: c,
		count: counts.get(i) || 0,
	}));
	indexed.sort((a, b) => b.count - a.count);

	return indexed.map(
		(c) =>
			[
				Math.round(c.color[0]),
				Math.round(c.color[1]),
				Math.round(c.color[2]),
			] as RGB
	);
}

/**
 * Find the closest color in a list to the target color.
 */
export function closestColor(colors: RGB[], target: RGB): RGB {
	let minDist = Infinity;
	let closest: RGB = colors[0] || [0, 0, 0];

	for (const color of colors) {
		const dist = Math.sqrt(
			Math.pow(color[0] - target[0], 2) +
				Math.pow(color[1] - target[1], 2) +
				Math.pow(color[2] - target[2], 2)
		);
		if (dist < minDist) {
			minDist = dist;
			closest = color;
		}
	}

	return closest;
}

/**
 * Convert RGB tuple to hex color string.
 */
export function rgbToHex(rgb: RGB): string {
	return (
		"#" +
		rgb
			.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
			.join("")
	);
}

/**
 * Convert hex color string to RGB tuple.
 */
export function hexToRgb(hex: string): RGB {
	const h = hex.replace("#", "");
	return [
		parseInt(h.substring(0, 2), 16),
		parseInt(h.substring(2, 4), 16),
		parseInt(h.substring(4, 6), 16),
	];
}

interface RawStyleResponse {
	foreground_color: string;
	border_color: string;
	font_weight: number;
}

/**
 * Extracts text styling from image regions using OpenAI vision.
 */
export class TextStyleExtractor {
	private client: OpenAI;
	private model: string;

	constructor(apiKey: string, model: string = "gpt-4o") {
		this.client = new OpenAI({ apiKey });
		this.model = model;
	}

	/**
	 * Get raw text style from OpenAI.
	 */
	private async getRawStyle(imageDataUri: string): Promise<RawStyleResponse> {
		const completion = await this.client.chat.completions.create({
			model: this.model,
			response_format: STYLE_RESPONSE_FORMAT,
			messages: [
				{ role: "system", content: STYLE_PROMPT },
				{
					role: "user",
					content: [
						{ type: "image_url", image_url: { url: imageDataUri } },
					],
				},
			],
		});

		const content = completion.choices[0]?.message?.content;
		if (!content) {
			throw new Error("No style response from OpenAI");
		}

		return JSON.parse(content) as RawStyleResponse;
	}

	/**
	 * Extract text style from an image region.
	 *
	 * Uses OpenAI to identify colors and font weight.
	 * Since we can't extract pixels in Cloudflare Workers, we trust the
	 * OpenAI vision model's color identification directly.
	 *
	 * @param imageDataUri - Base64 data URI of the text region image
	 * @param box - The bounding box for calculating font size
	 * @returns TextStyle with colors and font info
	 */
	async extract(imageDataUri: string, box: BoundingBox): Promise<TextStyle> {
		const rawStyle = await this.getRawStyle(imageDataUri);
		const { height } = getRectifiedDimensions(box);

		return {
			foregroundColor: rawStyle.foreground_color,
			borderColor: rawStyle.border_color,
			fontWeight: rawStyle.font_weight,
			fontSize: height * 0.8,
		};
	}
}
