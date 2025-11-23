/**
 * Google Cloud Vision OCR integration.
 */

import type { Point, TextAnnotation, BoundingBox } from "./types";

interface GoogleVisionVertex {
	x?: number;
	y?: number;
}

interface GoogleVisionBoundingPoly {
	vertices: GoogleVisionVertex[];
}

interface GoogleVisionTextAnnotation {
	description: string;
	boundingPoly: GoogleVisionBoundingPoly;
}

interface GoogleVisionResponse {
	responses: Array<{
		textAnnotations?: GoogleVisionTextAnnotation[];
		error?: {
			message: string;
			code: number;
		};
	}>;
}

/**
 * Detect text in an image using Google Cloud Vision API.
 *
 * @param imageUrl - URL of the image to analyze
 * @param apiKey - Google Cloud API key
 * @returns List of TextAnnotation objects with detected text and bounding boxes
 */
export async function detectText(
	imageUrl: string,
	apiKey: string
): Promise<TextAnnotation[]> {
	const requestBody = {
		requests: [
			{
				image: {
					source: {
						imageUri: imageUrl,
					},
				},
				features: [
					{
						type: "TEXT_DETECTION",
					},
				],
				imageContext: {
					languageHints: ["ja"],
				},
			},
		],
	};

	const response = await fetch(
		`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
		}
	);

	if (!response.ok) {
		throw new Error(`Google Vision API error: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as GoogleVisionResponse;

	if (data.responses[0]?.error) {
		throw new Error(`Google Vision API error: ${data.responses[0].error.message}`);
	}

	const rawAnnotations = data.responses[0]?.textAnnotations ?? [];
	return convertAnnotations(rawAnnotations);
}

/**
 * Convert Google Vision API annotations to our TextAnnotation model.
 */
function convertAnnotations(
	rawAnnotations: GoogleVisionTextAnnotation[]
): TextAnnotation[] {
	const annotations: TextAnnotation[] = [];

	// Skip the first annotation (full image text)
	for (let i = 1; i < rawAnnotations.length; i++) {
		const annotation = rawAnnotations[i];
		const vertices = annotation.boundingPoly.vertices;
		const points: Point[] = [];

		for (const vertex of vertices) {
			const x = vertex.x ?? 0;
			const y = vertex.y ?? 0;
			points.push({ x, y });
		}

		if (points.length === 4) {
			annotations.push({
				description: annotation.description,
				boundingPoly: { vertices: points } as BoundingBox,
			});
		}
	}

	return annotations;
}
