import { describe, it, expect } from "vitest";
import {
	getBoxCenter,
	getBoxAngle,
	getBoxDimensions,
	getBoxArea,
} from "../src/types";
import type { BoundingBox } from "../src/types";

describe("types - BoundingBox utilities", () => {
	function createBox(
		x: number,
		y: number,
		width: number,
		height: number
	): BoundingBox {
		return {
			vertices: [
				{ x, y },
				{ x: x + width, y },
				{ x: x + width, y: y + height },
				{ x, y: y + height },
			],
		};
	}

	describe("getBoxCenter", () => {
		it("should calculate center of a box at origin", () => {
			const box = createBox(0, 0, 100, 100);
			const center = getBoxCenter(box);
			expect(center.x).toBe(50);
			expect(center.y).toBe(50);
		});

		it("should calculate center of an offset box", () => {
			const box = createBox(20, 30, 100, 50);
			const center = getBoxCenter(box);
			expect(center.x).toBe(70);
			expect(center.y).toBe(55);
		});
	});

	describe("getBoxAngle", () => {
		it("should return 0 for a horizontal box", () => {
			const box = createBox(0, 0, 100, 50);
			const angle = getBoxAngle(box);
			expect(angle).toBeCloseTo(0, 5);
		});

		it("should return positive angle for tilted box", () => {
			const box: BoundingBox = {
				vertices: [
					{ x: 0, y: 0 },
					{ x: 100, y: 50 },
					{ x: 100, y: 100 },
					{ x: 0, y: 50 },
				],
			};
			const angle = getBoxAngle(box);
			expect(angle).toBeGreaterThan(0);
			expect(angle).toBeLessThan(Math.PI / 2);
		});
	});

	describe("getBoxDimensions", () => {
		it("should calculate width and height correctly", () => {
			const box = createBox(0, 0, 100, 50);
			const { width, height } = getBoxDimensions(box);
			expect(width).toBeCloseTo(100, 1);
			expect(height).toBeCloseTo(50, 1);
		});
	});

	describe("getBoxArea", () => {
		it("should calculate area correctly", () => {
			const box = createBox(0, 0, 100, 50);
			const area = getBoxArea(box);
			expect(area).toBeCloseTo(5000, 0);
		});
	});
});
