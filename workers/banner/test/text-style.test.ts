import { describe, it, expect } from "vitest";
import {
	getDominantColors,
	closestColor,
	rgbToHex,
	hexToRgb,
} from "../src/text-style";
import type { RGB } from "../src/types";

describe("text-style utilities", () => {
	describe("rgbToHex", () => {
		it("should convert black to #000000", () => {
			expect(rgbToHex([0, 0, 0])).toBe("#000000");
		});

		it("should convert white to #ffffff", () => {
			expect(rgbToHex([255, 255, 255])).toBe("#ffffff");
		});

		it("should convert red to #ff0000", () => {
			expect(rgbToHex([255, 0, 0])).toBe("#ff0000");
		});

		it("should convert a random color correctly", () => {
			expect(rgbToHex([18, 52, 86])).toBe("#123456");
		});
	});

	describe("hexToRgb", () => {
		it("should convert #000000 to [0, 0, 0]", () => {
			expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
		});

		it("should convert #ffffff to [255, 255, 255]", () => {
			expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
		});

		it("should convert #ff0000 to [255, 0, 0]", () => {
			expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
		});

		it("should handle hex without # prefix", () => {
			expect(hexToRgb("123456")).toEqual([18, 52, 86]);
		});
	});

	describe("closestColor", () => {
		it("should find exact match", () => {
			const colors: RGB[] = [
				[255, 0, 0],
				[0, 255, 0],
				[0, 0, 255],
			];
			expect(closestColor(colors, [255, 0, 0])).toEqual([255, 0, 0]);
		});

		it("should find closest color", () => {
			const colors: RGB[] = [
				[255, 0, 0],
				[0, 255, 0],
				[0, 0, 255],
			];
			// Orange (255, 128, 0) is closest to red
			expect(closestColor(colors, [255, 128, 0])).toEqual([255, 0, 0]);
		});

		it("should return first color if list has one item", () => {
			expect(closestColor([[100, 100, 100]], [0, 0, 0])).toEqual([
				100, 100, 100,
			]);
		});
	});

	describe("getDominantColors", () => {
		it("should return empty array for empty input", () => {
			expect(getDominantColors([])).toEqual([]);
		});

		it("should cluster similar colors together", () => {
			const pixels: RGB[] = [
				[255, 0, 0],
				[254, 1, 1],
				[253, 2, 0],
				[0, 0, 255],
				[1, 1, 254],
			];

			const colors = getDominantColors(pixels, 2);
			expect(colors.length).toBe(2);
		});
	});
});
