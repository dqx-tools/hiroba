/**
 * Fetch rotation banner slides from DQX hiroba.
 */

import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { Slide } from "./types";

const BANNER_URL = "https://hiroba.dqx.jp/sc/rotationbanner";
const HREF_REGEX = /javascript:ctrLinkAction\('link=([^']+)'\);/;

const DEFAULT_HEADERS = {
	Accept: "text/html",
	"User-Agent": "Barohi/1.0",
};

/**
 * Extract slide data from HTML element.
 */
function extractSlide($: CheerioAPI, slide: AnyNode): Slide {
	const $slide = $(slide);
	const $link = $slide.find("a");
	const $image = $slide.find("img");

	const hrefAttr = $link.attr("href");
	const hrefMatch = hrefAttr ? HREF_REGEX.exec(hrefAttr) : null;
	const href = hrefMatch ? hrefMatch[1] : null;

	const src = $image.attr("src") ?? null;
	const alt = $image.attr("alt") ?? null;

	return { alt, src, href };
}

/**
 * Fetch rotation banner slides from DQX hiroba.
 *
 * @returns List of Slide objects with banner information
 */
export async function getBannerSlides(): Promise<Slide[]> {
	const response = await fetch(BANNER_URL, {
		headers: DEFAULT_HEADERS,
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch banner slides: ${response.status} ${response.statusText}`
		);
	}

	const html = await response.text();
	const $ = load(html);
	const slides = $("#topBanner .slide");

	const result: Slide[] = [];
	slides.each((_, slide) => {
		result.push(extractSlide($, slide));
	});

	return result;
}
