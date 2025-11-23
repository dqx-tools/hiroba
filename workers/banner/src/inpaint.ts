/**
 * Image inpainting to remove text regions using Replicate.
 */

import Replicate from "replicate";
import type { TextAnnotation } from "./types";

/**
 * Inpaint regions of an image to remove text using Replicate.
 *
 * Uses the qwen/qwen-image-edit-plus model with the prompt
 * "Remove the text from the image".
 *
 * @param imageDataUri - Base64 data URI of the image
 * @param annotations - List of TextAnnotation objects (kept for API compatibility,
 *                     but the AI model handles text detection internally)
 * @param apiToken - Replicate API token
 * @returns Base64 data URI of the inpainted image
 */
export async function inpaintTextRegions(
	imageDataUri: string,
	_annotations: TextAnnotation[],
	apiToken: string
): Promise<string> {
	const replicate = new Replicate({ auth: apiToken });

	const output = await replicate.run("qwen/qwen-image-edit-plus", {
		input: {
			image: imageDataUri,
			prompt: "Remove the text from the image",
		},
	});

	// Handle different output formats from Replicate
	let outputUrl: string;
	if (Array.isArray(output) && output.length > 0) {
		outputUrl = String(output[0]);
	} else {
		outputUrl = String(output);
	}

	// Download the result image and convert to data URI
	const response = await fetch(outputUrl);
	if (!response.ok) {
		throw new Error(`Failed to download inpainted image: ${response.status}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const base64 = btoa(
		new Uint8Array(arrayBuffer).reduce(
			(data, byte) => data + String.fromCharCode(byte),
			""
		)
	);

	return `data:image/png;base64,${base64}`;
}
