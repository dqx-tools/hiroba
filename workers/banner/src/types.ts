/**
 * Type definitions for DQX Banner Translation API.
 */

/**
 * Represents a 2D point with x and y coordinates.
 */
export interface Point {
	x: number;
	y: number;
}

/**
 * Represents a rotated rectangular bounding box defined by four vertices.
 * Vertices should be in clockwise order.
 */
export interface BoundingBox {
	vertices: Point[];
}

/**
 * Represents a text annotation with a description and bounding polygon.
 */
export interface TextAnnotation {
	description: string;
	boundingPoly: BoundingBox;
}

/**
 * Text styling information extracted from an image region.
 */
export interface TextStyle {
	foregroundColor: string;
	borderColor: string;
	fontWeight: number;
	fontSize: number;
}

/**
 * A banner slide from the DQX hiroba rotation banner.
 */
export interface Slide {
	alt: string | null;
	src: string | null;
	href: string | null;
}

/**
 * A piece of translated text with its positioning and style.
 */
export interface TranslatedText {
	original: string;
	translated: string;
	boundingBox: BoundingBox;
	style: TextStyle;
	fontFamily: string;
}

/**
 * RGB color tuple.
 */
export type RGB = [number, number, number];

/**
 * Cloudflare Worker environment bindings.
 */
export interface Env {
	OPENAI_API_KEY: string;
	OPENAI_MODEL?: string;
	REPLICATE_API_TOKEN: string;
	GOOGLE_CLOUD_API_KEY: string;
}

/**
 * API response for banner translation.
 */
export interface BannerTranslationResponse {
	svg: string;
	slide: Slide;
}

/**
 * API response for health check.
 */
export interface HealthResponse {
	status: string;
	service: string;
}

// ============================================================================
// Bounding Box Utilities
// ============================================================================

/**
 * Calculate the center point of a bounding box.
 */
export function getBoxCenter(box: BoundingBox): Point {
	const x = box.vertices.reduce((sum, p) => sum + p.x, 0) / 4;
	const y = box.vertices.reduce((sum, p) => sum + p.y, 0) / 4;
	return { x, y };
}

/**
 * Calculate the rotation angle of the box in radians.
 */
export function getBoxAngle(box: BoundingBox): number {
	const dx = box.vertices[1].x - box.vertices[0].x;
	const dy = box.vertices[1].y - box.vertices[0].y;
	return Math.atan2(dy, dx);
}

/**
 * Calculate width and height of the box.
 */
export function getBoxDimensions(box: BoundingBox): { width: number; height: number } {
	const distances: number[] = [];
	for (let i = 0; i < 4; i++) {
		const nextI = (i + 1) % 4;
		const dx = box.vertices[nextI].x - box.vertices[i].x;
		const dy = box.vertices[nextI].y - box.vertices[i].y;
		distances.push(Math.sqrt(dx * dx + dy * dy));
	}

	const width = (distances[0] + distances[2]) / 2;
	const height = (distances[1] + distances[3]) / 2;
	return { width, height };
}

/**
 * Calculate the area of the bounding box.
 */
export function getBoxArea(box: BoundingBox): number {
	const { width, height } = getBoxDimensions(box);
	return width * height;
}

/**
 * Convert bounding box vertices to a flat array of coordinates.
 */
export function boxToCoords(box: BoundingBox): number[][] {
	return box.vertices.map((p) => [p.x, p.y]);
}
