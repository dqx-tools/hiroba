import { describe, it, expect } from "vitest";
import {
	calculateIoU,
	boxesOverlap,
	boxesVerticallyAligned,
	mergeBoxes,
	cleanTextAnnotations,
} from "../src/bounding-boxes";
import type { BoundingBox, TextAnnotation } from "../src/types";

describe("bounding-boxes", () => {
	// Helper to create a simple axis-aligned rectangle
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

	describe("calculateIoU", () => {
		it("should return 1 for identical boxes", () => {
			const box = createBox(0, 0, 100, 100);
			const iou = calculateIoU(box, box);
			expect(iou).toBeCloseTo(1, 1);
		});

		it("should return 0 for non-overlapping boxes", () => {
			const box1 = createBox(0, 0, 100, 100);
			const box2 = createBox(200, 200, 100, 100);
			const iou = calculateIoU(box1, box2);
			expect(iou).toBe(0);
		});

		it("should return ~0.14 for 50% overlap in both dimensions", () => {
			const box1 = createBox(0, 0, 100, 100);
			const box2 = createBox(50, 50, 100, 100);
			const iou = calculateIoU(box1, box2);
			// Intersection = 50x50 = 2500
			// Union = 100x100 + 100x100 - 2500 = 17500
			// IoU = 2500/17500 ≈ 0.143
			expect(iou).toBeGreaterThan(0.1);
			expect(iou).toBeLessThan(0.2);
		});
	});

	describe("boxesOverlap", () => {
		it("should return true for overlapping boxes with same angle", () => {
			const box1 = createBox(0, 0, 100, 50);
			const box2 = createBox(50, 0, 100, 50);
			expect(boxesOverlap(box1, box2)).toBe(true);
		});

		it("should return false for non-overlapping boxes", () => {
			const box1 = createBox(0, 0, 100, 50);
			const box2 = createBox(200, 0, 100, 50);
			expect(boxesOverlap(box1, box2)).toBe(false);
		});

		it("should return false for boxes with different Y centers beyond threshold", () => {
			const box1 = createBox(0, 0, 100, 50);
			const box2 = createBox(50, 100, 100, 50);
			expect(boxesOverlap(box1, box2)).toBe(false);
		});
	});

	describe("boxesVerticallyAligned", () => {
		it("should return true for horizontally adjacent boxes at same Y", () => {
			const box1 = createBox(0, 0, 100, 50);
			const box2 = createBox(110, 0, 100, 50); // 10px gap
			expect(boxesVerticallyAligned(box1, box2)).toBe(true);
		});

		it("should return false for boxes too far apart horizontally", () => {
			const box1 = createBox(0, 0, 100, 50);
			const box2 = createBox(200, 0, 100, 50); // 100px gap > half height
			expect(boxesVerticallyAligned(box1, box2)).toBe(false);
		});

		it("should return false for boxes without enough vertical overlap", () => {
			const box1 = createBox(0, 0, 100, 50);
			const box2 = createBox(110, 40, 100, 50); // Only 10px overlap
			expect(boxesVerticallyAligned(box1, box2)).toBe(false);
		});
	});

	describe("mergeBoxes", () => {
		it("should combine descriptions left-to-right when boxes don't highly overlap", () => {
			const ann1: TextAnnotation = {
				description: "Hello",
				boundingPoly: createBox(0, 0, 50, 30),
			};
			const ann2: TextAnnotation = {
				description: "World",
				boundingPoly: createBox(60, 0, 50, 30),
			};

			const merged = mergeBoxes(ann1, ann2);
			expect(merged.description).toBe("Hello World");
		});

		it("should keep longer description when boxes highly overlap", () => {
			const ann1: TextAnnotation = {
				description: "Hello World",
				boundingPoly: createBox(0, 0, 100, 30),
			};
			const ann2: TextAnnotation = {
				description: "Hello",
				boundingPoly: createBox(10, 5, 90, 25),
			};

			const merged = mergeBoxes(ann1, ann2);
			expect(merged.description).toBe("Hello World");
		});
	});

	describe("cleanTextAnnotations", () => {
		it("should merge overlapping annotations", () => {
			const annotations: TextAnnotation[] = [
				{ description: "A", boundingPoly: createBox(0, 0, 100, 50) },
				{ description: "B", boundingPoly: createBox(50, 0, 100, 50) },
			];

			const cleaned = cleanTextAnnotations(annotations);
			expect(cleaned.length).toBe(1);
		});

		it("should merge horizontally adjacent annotations", () => {
			const annotations: TextAnnotation[] = [
				{ description: "Hello", boundingPoly: createBox(0, 0, 60, 30) },
				{ description: "World", boundingPoly: createBox(65, 0, 60, 30) },
			];

			const cleaned = cleanTextAnnotations(annotations);
			expect(cleaned.length).toBe(1);
			expect(cleaned[0].description).toContain("Hello");
			expect(cleaned[0].description).toContain("World");
		});

		it("should not merge distant annotations", () => {
			const annotations: TextAnnotation[] = [
				{ description: "Top", boundingPoly: createBox(0, 0, 60, 30) },
				{ description: "Bottom", boundingPoly: createBox(0, 100, 60, 30) },
			];

			const cleaned = cleanTextAnnotations(annotations);
			expect(cleaned.length).toBe(2);
		});
	});
});
