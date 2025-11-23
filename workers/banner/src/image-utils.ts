/**
 * Image loading and manipulation utilities.
 */

import type { BoundingBox, Point } from "./types";

/**
 * Image data with dimensions and pixel data.
 */
export interface ImageData {
	width: number;
	height: number;
	dataUri: string;
}

/**
 * Load an image from a URL and return as base64 data URI.
 *
 * @param url - URL of the image to load
 * @returns Image data with base64 URI and dimensions
 */
export async function loadImageFromUrl(url: string): Promise<ImageData> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const uint8Array = new Uint8Array(arrayBuffer);

	// Detect image type from magic bytes
	let mimeType = "image/png";
	if (uint8Array[0] === 0xff && uint8Array[1] === 0xd8) {
		mimeType = "image/jpeg";
	} else if (
		uint8Array[0] === 0x47 &&
		uint8Array[1] === 0x49 &&
		uint8Array[2] === 0x46
	) {
		mimeType = "image/gif";
	}

	const base64 = btoa(
		uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), "")
	);
	const dataUri = `data:${mimeType};base64,${base64}`;

	// Parse image dimensions from the binary data
	const dimensions = parseImageDimensions(uint8Array, mimeType);

	return {
		width: dimensions.width,
		height: dimensions.height,
		dataUri,
	};
}

/**
 * Parse image dimensions from binary data.
 */
function parseImageDimensions(
	data: Uint8Array,
	mimeType: string
): { width: number; height: number } {
	if (mimeType === "image/png") {
		// PNG: width and height are at bytes 16-23 (big-endian)
		if (data.length >= 24) {
			const width =
				(data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
			const height =
				(data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
			return { width, height };
		}
	} else if (mimeType === "image/jpeg") {
		// JPEG: need to find SOF0 marker (0xFF 0xC0)
		let i = 2;
		while (i < data.length - 9) {
			if (data[i] === 0xff) {
				const marker = data[i + 1];
				if (marker === 0xc0 || marker === 0xc2) {
					const height = (data[i + 5] << 8) | data[i + 6];
					const width = (data[i + 7] << 8) | data[i + 8];
					return { width, height };
				}
				if (marker === 0xd8 || marker === 0xd9) {
					i += 2;
				} else {
					const length = (data[i + 2] << 8) | data[i + 3];
					i += 2 + length;
				}
			} else {
				i++;
			}
		}
	} else if (mimeType === "image/gif") {
		// GIF: width and height are at bytes 6-9 (little-endian)
		if (data.length >= 10) {
			const width = data[6] | (data[7] << 8);
			const height = data[8] | (data[9] << 8);
			return { width, height };
		}
	}

	// Default fallback
	return { width: 0, height: 0 };
}

/**
 * Order points in clockwise order starting from top-left.
 */
export function orderPoints(pts: Point[]): Point[] {
	if (pts.length !== 4) {
		throw new Error("Expected exactly 4 points");
	}

	// Find top-left (min sum of x+y) and bottom-right (max sum of x+y)
	const sums = pts.map((p) => p.x + p.y);
	const topLeftIdx = sums.indexOf(Math.min(...sums));
	const bottomRightIdx = sums.indexOf(Math.max(...sums));

	// Find top-right (min diff y-x) and bottom-left (max diff y-x)
	const diffs = pts.map((p) => p.y - p.x);
	const topRightIdx = diffs.indexOf(Math.min(...diffs));
	const bottomLeftIdx = diffs.indexOf(Math.max(...diffs));

	return [
		pts[topLeftIdx],
		pts[topRightIdx],
		pts[bottomRightIdx],
		pts[bottomLeftIdx],
	];
}

/**
 * Get the axis-aligned bounding rectangle of a rotated box.
 *
 * Since we can't do perspective transforms in Cloudflare Workers,
 * we return the bounding rectangle coordinates for simpler cropping.
 */
export function getBoxBounds(box: BoundingBox): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const p of box.vertices) {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	}

	return {
		minX: Math.floor(minX),
		minY: Math.floor(minY),
		maxX: Math.ceil(maxX),
		maxY: Math.ceil(maxY),
		width: Math.ceil(maxX) - Math.floor(minX),
		height: Math.ceil(maxY) - Math.floor(minY),
	};
}

/**
 * Calculate the dimensions of the rectified box region.
 */
export function getRectifiedDimensions(box: BoundingBox): {
	width: number;
	height: number;
} {
	const ordered = orderPoints(box.vertices);

	const widthA = Math.sqrt(
		Math.pow(ordered[2].x - ordered[3].x, 2) +
			Math.pow(ordered[2].y - ordered[3].y, 2)
	);
	const widthB = Math.sqrt(
		Math.pow(ordered[1].x - ordered[0].x, 2) +
			Math.pow(ordered[1].y - ordered[0].y, 2)
	);
	const maxWidth = Math.max(Math.floor(widthA), Math.floor(widthB));

	const heightA = Math.sqrt(
		Math.pow(ordered[1].x - ordered[2].x, 2) +
			Math.pow(ordered[1].y - ordered[2].y, 2)
	);
	const heightB = Math.sqrt(
		Math.pow(ordered[0].x - ordered[3].x, 2) +
			Math.pow(ordered[0].y - ordered[3].y, 2)
	);
	const maxHeight = Math.max(Math.floor(heightA), Math.floor(heightB));

	return { width: maxWidth, height: maxHeight };
}
