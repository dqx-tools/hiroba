/**
 * SVG rendering for translated banners.
 */

import type { TranslatedText } from "./types";
import { getBoxCenter, getBoxDimensions, getBoxAngle } from "./types";

/**
 * Escape special XML characters.
 */
function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Render translated texts as an SVG overlay on an image.
 *
 * @param backgroundImageDataUri - Base64 data URI of the inpainted background image
 * @param width - Image width
 * @param height - Image height
 * @param translatedTexts - List of translated text elements with positioning
 * @returns SVG string with the rendered banner
 */
export function renderSvg(
	backgroundImageDataUri: string,
	width: number,
	height: number,
	translatedTexts: TranslatedText[]
): string {
	const svgParts: string[] = [
		`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
		`<image href="${backgroundImageDataUri}" width="${width}" height="${height}" />`,
	];

	for (const text of translatedTexts) {
		const box = text.boundingBox;
		const style = text.style;
		const center = getBoxCenter(box);
		const { width: boxWidth } = getBoxDimensions(box);
		const angleDeg = (getBoxAngle(box) * 180) / Math.PI;

		const textElem =
			`<text x="${center.x}" y="${center.y}" ` +
			`fill="${style.foregroundColor}" ` +
			`stroke="${style.borderColor}" stroke-width="2" ` +
			`font-weight="${style.fontWeight}" ` +
			`font-family="${text.fontFamily}" ` +
			`dominant-baseline="middle" ` +
			`font-size="${style.fontSize}" ` +
			`text-anchor="middle" ` +
			`paint-order="stroke fill" ` +
			`textLength="${boxWidth}" ` +
			`lengthAdjust="spacingAndGlyphs" ` +
			`transform="rotate(${angleDeg})" ` +
			`transform-origin="center">` +
			`${escapeXml(text.translated)}</text>`;

		svgParts.push(textElem);
	}

	svgParts.push("</svg>");
	return svgParts.join("\n");
}
