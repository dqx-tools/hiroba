/**
 * Main banner translation pipeline.
 */

import { cleanTextAnnotations } from "./bounding-boxes";
import { FontMapper } from "./font";
import { loadImageFromUrl, type ImageData } from "./image-utils";
import { inpaintTextRegions } from "./inpaint";
import { detectText } from "./ocr";
import { renderSvg } from "./renderer";
import { getBannerSlides } from "./slides";
import { TextStyleExtractor } from "./text-style";
import { ImageTranslator } from "./translator";
import type { Env, Slide, TranslatedText } from "./types";

/**
 * Complete pipeline for translating DQX banner images.
 *
 * Handles the full process:
 * 1. OCR text detection
 * 2. Bounding box cleaning/merging
 * 3. Text region inpainting
 * 4. Text translation
 * 5. Style extraction
 * 6. SVG rendering
 */
export class BannerTranslator {
	private translator: ImageTranslator;
	private styleExtractor: TextStyleExtractor;
	private fontMapper: FontMapper;
	private googleApiKey: string;
	private replicateApiToken: string;

	/**
	 * Initialize the banner translator.
	 *
	 * @param env - Cloudflare Worker environment bindings
	 * @param translationModel - Model to use for text translation
	 * @param styleModel - Model to use for style extraction
	 * @param fontModel - Model to use for font mapping
	 */
	constructor(
		env: Env,
		translationModel: string = "gpt-4o",
		styleModel: string = "gpt-4o",
		fontModel: string = "gpt-4o-mini"
	) {
		this.translator = new ImageTranslator(env.OPENAI_API_KEY, translationModel);
		this.styleExtractor = new TextStyleExtractor(env.OPENAI_API_KEY, styleModel);
		this.fontMapper = new FontMapper(env.OPENAI_API_KEY, fontModel);
		this.googleApiKey = env.GOOGLE_CLOUD_API_KEY;
		this.replicateApiToken = env.REPLICATE_API_TOKEN;
	}

	/**
	 * Translate a banner image from a URL.
	 *
	 * @param imageUrl - URL of the banner image
	 * @returns SVG string with translated banner
	 */
	async translateImageUrl(imageUrl: string): Promise<string> {
		const image = await loadImageFromUrl(imageUrl);
		return this.translateImage(image, imageUrl);
	}

	/**
	 * Translate a banner image.
	 *
	 * @param image - Image data with base64 URI and dimensions
	 * @param sourceUrl - URL for OCR (Google Vision needs URL)
	 * @returns SVG string with translated banner
	 */
	async translateImage(image: ImageData, sourceUrl: string): Promise<string> {
		// Step 1: Detect text using OCR
		const rawAnnotations = await detectText(sourceUrl, this.googleApiKey);

		// Step 2: Clean and merge bounding boxes
		const annotations = cleanTextAnnotations(rawAnnotations);

		if (annotations.length === 0) {
			// No text found, return original image as SVG
			return renderSvg(image.dataUri, image.width, image.height, []);
		}

		// Step 3: Inpaint text regions
		const inpaintedDataUri = await inpaintTextRegions(
			image.dataUri,
			annotations,
			this.replicateApiToken
		);

		// Step 4: Translate all texts
		const texts = annotations.map((ann) => ann.description);
		const translations = await this.translator.translateTexts(
			image.dataUri,
			texts
		);

		// Step 5: Extract styles and build translated text objects
		const translatedTexts: TranslatedText[] = [];
		for (const annotation of annotations) {
			// Use the full image for style extraction since we can't do
			// perspective transforms in Cloudflare Workers
			const style = await this.styleExtractor.extract(
				image.dataUri,
				annotation.boundingPoly
			);

			const original = annotation.description;
			const translated = translations[original] || original;

			translatedTexts.push({
				original,
				translated,
				boundingBox: annotation.boundingPoly,
				style,
				fontFamily: "Open Sans",
			});
		}

		// Step 6: Render SVG
		return renderSvg(
			inpaintedDataUri,
			image.width,
			image.height,
			translatedTexts
		);
	}

	/**
	 * Translate all current rotation banners.
	 *
	 * @returns List of [Slide, SVG] tuples
	 */
	async translateAllBanners(): Promise<Array<{ slide: Slide; svg: string }>> {
		const slides = await getBannerSlides();
		const results: Array<{ slide: Slide; svg: string }> = [];

		for (const slide of slides) {
			if (slide.src) {
				try {
					const svg = await this.translateImageUrl(slide.src);
					results.push({ slide, svg });
				} catch (e) {
					console.error(`Error translating ${slide.src}:`, e);
				}
			}
		}

		return results;
	}
}
