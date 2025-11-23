/**
 * Bounding box cleaning and merging utilities.
 */

import {
	type BoundingBox,
	type Point,
	type TextAnnotation,
	getBoxCenter,
	getBoxAngle,
	getBoxDimensions,
	getBoxArea,
} from "./types";

/**
 * Check if a point is inside a polygon using ray casting algorithm.
 */
function pointInPolygon(point: Point, polygon: Point[]): boolean {
	let inside = false;
	const n = polygon.length;

	for (let i = 0, j = n - 1; i < n; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;

		if (
			yi > point.y !== yj > point.y &&
			point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
		) {
			inside = !inside;
		}
	}

	return inside;
}

/**
 * Get the bounding rectangle of a polygon.
 */
function getPolygonBounds(polygon: Point[]): {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
} {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	for (const p of polygon) {
		minX = Math.min(minX, p.x);
		maxX = Math.max(maxX, p.x);
		minY = Math.min(minY, p.y);
		maxY = Math.max(maxY, p.y);
	}

	return { minX, maxX, minY, maxY };
}

/**
 * Calculate intersection over union of two boxes using grid sampling.
 */
export function calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
	const poly1 = box1.vertices;
	const poly2 = box2.vertices;

	// Get combined bounding rectangle
	const bounds1 = getPolygonBounds(poly1);
	const bounds2 = getPolygonBounds(poly2);

	const xMin = Math.min(bounds1.minX, bounds2.minX);
	const xMax = Math.max(bounds1.maxX, bounds2.maxX);
	const yMin = Math.min(bounds1.minY, bounds2.minY);
	const yMax = Math.max(bounds1.maxY, bounds2.maxY);

	// Sample points in a grid
	const gridSize = 100;
	const xStep = (xMax - xMin) / gridSize;
	const yStep = (yMax - yMin) / gridSize;

	let intersection = 0;
	let union = 0;

	for (let i = 0; i < gridSize; i++) {
		for (let j = 0; j < gridSize; j++) {
			const point: Point = {
				x: xMin + i * xStep,
				y: yMin + j * yStep,
			};

			const inPoly1 = pointInPolygon(point, poly1);
			const inPoly2 = pointInPolygon(point, poly2);

			if (inPoly1 && inPoly2) {
				intersection++;
				union++;
			} else if (inPoly1 || inPoly2) {
				union++;
			}
		}
	}

	return union > 0 ? intersection / union : 0;
}

/**
 * Calculate the intersection area of two polygons using grid sampling.
 */
function calculateIntersectionArea(
	poly1: Point[],
	poly2: Point[]
): number {
	const bounds1 = getPolygonBounds(poly1);
	const bounds2 = getPolygonBounds(poly2);

	// Check if bounding boxes even overlap
	if (
		bounds1.maxX < bounds2.minX ||
		bounds2.maxX < bounds1.minX ||
		bounds1.maxY < bounds2.minY ||
		bounds2.maxY < bounds1.minY
	) {
		return 0;
	}

	const xMin = Math.max(bounds1.minX, bounds2.minX);
	const xMax = Math.min(bounds1.maxX, bounds2.maxX);
	const yMin = Math.max(bounds1.minY, bounds2.minY);
	const yMax = Math.min(bounds1.maxY, bounds2.maxY);

	const gridSize = 50;
	const xStep = (xMax - xMin) / gridSize;
	const yStep = (yMax - yMin) / gridSize;

	let count = 0;
	for (let i = 0; i < gridSize; i++) {
		for (let j = 0; j < gridSize; j++) {
			const point: Point = {
				x: xMin + i * xStep,
				y: yMin + j * yStep,
			};
			if (pointInPolygon(point, poly1) && pointInPolygon(point, poly2)) {
				count++;
			}
		}
	}

	const cellArea = xStep * yStep;
	return count * cellArea;
}

/**
 * Calculate the area of a polygon using the shoelace formula.
 */
function calculatePolygonArea(polygon: Point[]): number {
	let area = 0;
	const n = polygon.length;

	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		area += polygon[i].x * polygon[j].y;
		area -= polygon[j].x * polygon[i].y;
	}

	return Math.abs(area) / 2;
}

/**
 * Check if two polygons intersect.
 */
function polygonsIntersect(poly1: Point[], poly2: Point[]): boolean {
	// Check if any vertex of poly1 is inside poly2
	for (const p of poly1) {
		if (pointInPolygon(p, poly2)) return true;
	}
	// Check if any vertex of poly2 is inside poly1
	for (const p of poly2) {
		if (pointInPolygon(p, poly1)) return true;
	}

	// Check if any edges intersect
	for (let i = 0; i < poly1.length; i++) {
		const a1 = poly1[i];
		const a2 = poly1[(i + 1) % poly1.length];
		for (let j = 0; j < poly2.length; j++) {
			const b1 = poly2[j];
			const b2 = poly2[(j + 1) % poly2.length];
			if (segmentsIntersect(a1, a2, b1, b2)) return true;
		}
	}

	return false;
}

/**
 * Check if two line segments intersect.
 */
function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
	const d1 = direction(b1, b2, a1);
	const d2 = direction(b1, b2, a2);
	const d3 = direction(a1, a2, b1);
	const d4 = direction(a1, a2, b2);

	if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
		((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
		return true;
	}

	if (d1 === 0 && onSegment(b1, b2, a1)) return true;
	if (d2 === 0 && onSegment(b1, b2, a2)) return true;
	if (d3 === 0 && onSegment(a1, a2, b1)) return true;
	if (d4 === 0 && onSegment(a1, a2, b2)) return true;

	return false;
}

function direction(p1: Point, p2: Point, p3: Point): number {
	return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
}

function onSegment(p1: Point, p2: Point, p: Point): boolean {
	return (
		Math.min(p1.x, p2.x) <= p.x &&
		p.x <= Math.max(p1.x, p2.x) &&
		Math.min(p1.y, p2.y) <= p.y &&
		p.y <= Math.max(p1.y, p2.y)
	);
}

/**
 * Check if two boxes overlap or are very close to each other.
 *
 * Criteria:
 * 1. Boxes must be within 5 degrees of aligned
 * 2. Y centerpoints must be within half of either box's height
 * 3. Boxes must intersect
 */
export function boxesOverlap(box1: BoundingBox, box2: BoundingBox): boolean {
	let angleDiff = Math.abs(getBoxAngle(box1) - getBoxAngle(box2));
	angleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);

	if ((angleDiff * 180) / Math.PI > 5) {
		return false;
	}

	const referenceAngle = (getBoxAngle(box1) + getBoxAngle(box2)) / 2;
	const cosAngle = Math.cos(-referenceAngle);
	const sinAngle = Math.sin(-referenceAngle);

	const center1 = getBoxCenter(box1);
	const center2 = getBoxCenter(box2);

	const x2Centered = center2.x - center1.x;
	const y2Centered = center2.y - center1.y;
	const y2Rotated = x2Centered * sinAngle + y2Centered * cosAngle;

	const yCenterDiff = Math.abs(y2Rotated);

	const { height: height1 } = getBoxDimensions(box1);
	const { height: height2 } = getBoxDimensions(box2);

	const maxAllowedDiff = Math.min(height1, height2) / 2;
	if (yCenterDiff > maxAllowedDiff) {
		return false;
	}

	return polygonsIntersect(box1.vertices, box2.vertices);
}

/**
 * Check if two boxes are vertically aligned and horizontally adjacent.
 *
 * Criteria:
 * 1. Boxes must be within 5 degrees of aligned
 * 2. Vertical overlap must be at least 50% of the smaller box's height
 * 3. Horizontal distance must be less than half the average height
 */
export function boxesVerticallyAligned(
	box1: BoundingBox,
	box2: BoundingBox
): boolean {
	let angleDiff = Math.abs(getBoxAngle(box1) - getBoxAngle(box2));
	angleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
	if ((angleDiff * 180) / Math.PI > 5) {
		return false;
	}

	const referenceAngle = getBoxAngle(box1);
	const cosAngle = Math.cos(-referenceAngle);
	const sinAngle = Math.sin(-referenceAngle);

	const centerX = getBoxCenter(box1).x;
	const centerY = getBoxCenter(box1).y;

	function rotatePoints(box: BoundingBox): [number, number][] {
		return box.vertices.map((point) => {
			const xCentered = point.x - centerX;
			const yCentered = point.y - centerY;
			const xRotated = xCentered * cosAngle - yCentered * sinAngle;
			const yRotated = xCentered * sinAngle + yCentered * cosAngle;
			return [xRotated, yRotated];
		});
	}

	const rotatedBox1 = rotatePoints(box1);
	const rotatedBox2 = rotatePoints(box2);

	const box1MinY = Math.min(...rotatedBox1.map((p) => p[1]));
	const box1MaxY = Math.max(...rotatedBox1.map((p) => p[1]));
	const box2MinY = Math.min(...rotatedBox2.map((p) => p[1]));
	const box2MaxY = Math.max(...rotatedBox2.map((p) => p[1]));

	const box1MinX = Math.min(...rotatedBox1.map((p) => p[0]));
	const box1MaxX = Math.max(...rotatedBox1.map((p) => p[0]));
	const box2MinX = Math.min(...rotatedBox2.map((p) => p[0]));
	const box2MaxX = Math.max(...rotatedBox2.map((p) => p[0]));

	const box1Height = box1MaxY - box1MinY;
	const box2Height = box2MaxY - box2MinY;
	const avgHeight = (box1Height + box2Height) / 2;

	const minOverlap = Math.min(box1Height, box2Height) * 0.5;
	const yOverlap = Math.min(box1MaxY, box2MaxY) - Math.max(box1MinY, box2MinY);
	if (yOverlap < minOverlap) {
		return false;
	}

	let hDistance: number;
	if (box1MaxX < box2MinX) {
		hDistance = box2MinX - box1MaxX;
	} else if (box2MaxX < box1MinX) {
		hDistance = box1MinX - box2MaxX;
	} else {
		hDistance = 0;
	}

	return hDistance < avgHeight / 2;
}

/**
 * Merge two text annotations while preserving rotation.
 */
export function mergeBoxes(
	ann1: TextAnnotation,
	ann2: TextAnnotation
): TextAnnotation {
	const iou = calculateIoU(ann1.boundingPoly, ann2.boundingPoly);

	const box1Area = getBoxArea(ann1.boundingPoly);
	const box2Area = getBoxArea(ann2.boundingPoly);

	const poly1Area = calculatePolygonArea(ann1.boundingPoly.vertices);
	const poly2Area = calculatePolygonArea(ann2.boundingPoly.vertices);

	const intersectionArea = calculateIntersectionArea(
		ann1.boundingPoly.vertices,
		ann2.boundingPoly.vertices
	);

	const containment1In2 = poly1Area > 0 ? intersectionArea / poly1Area : 0;
	const containment2In1 = poly2Area > 0 ? intersectionArea / poly2Area : 0;

	let description: string;
	if (containment1In2 > 0.95 || containment2In1 > 0.95) {
		description =
			box1Area >= box2Area ? ann1.description : ann2.description;
	} else if (iou > 0.5) {
		description =
			ann1.description.length >= ann2.description.length
				? ann1.description
				: ann2.description;
	} else {
		const center1 = getBoxCenter(ann1.boundingPoly);
		const center2 = getBoxCenter(ann2.boundingPoly);
		if (center1.x <= center2.x) {
			description = `${ann1.description} ${ann2.description}`;
		} else {
			description = `${ann2.description} ${ann1.description}`;
		}
	}

	const mergedAngle =
		box1Area >= box2Area
			? getBoxAngle(ann1.boundingPoly)
			: getBoxAngle(ann2.boundingPoly);

	const allVertices = [
		...ann1.boundingPoly.vertices,
		...ann2.boundingPoly.vertices,
	];

	const cosAngle = Math.cos(-mergedAngle);
	const sinAngle = Math.sin(-mergedAngle);

	const mergedCenter = getBoxCenter(ann1.boundingPoly);

	const rotatedPoints = allVertices.map((point) => {
		const xCentered = point.x - mergedCenter.x;
		const yCentered = point.y - mergedCenter.y;
		const xRotated = xCentered * cosAngle - yCentered * sinAngle;
		const yRotated = xCentered * sinAngle + yCentered * cosAngle;
		return [xRotated, yRotated] as [number, number];
	});

	const xMinRot = Math.min(...rotatedPoints.map((p) => p[0]));
	const xMaxRot = Math.max(...rotatedPoints.map((p) => p[0]));
	const yMinRot = Math.min(...rotatedPoints.map((p) => p[1]));
	const yMaxRot = Math.max(...rotatedPoints.map((p) => p[1]));

	const cornersRot: [number, number][] = [
		[xMinRot, yMinRot],
		[xMaxRot, yMinRot],
		[xMaxRot, yMaxRot],
		[xMinRot, yMaxRot],
	];

	const mergedVertices: Point[] = cornersRot.map(([xRot, yRot]) => {
		const xOrig = xRot * cosAngle + yRot * sinAngle;
		const yOrig = -xRot * sinAngle + yRot * cosAngle;
		return {
			x: xOrig + mergedCenter.x,
			y: yOrig + mergedCenter.y,
		};
	});

	return {
		description,
		boundingPoly: { vertices: mergedVertices },
	};
}

/**
 * Merge boxes based on the provided criteria function.
 */
export function mergeBoxesWithCriteria(
	annotations: TextAnnotation[],
	mergeCriteria: (box1: BoundingBox, box2: BoundingBox) => boolean
): TextAnnotation[] {
	let result = [...annotations];

	while (true) {
		let merged = false;
		for (let i = 0; i < result.length; i++) {
			for (let j = i + 1; j < result.length; j++) {
				if (mergeCriteria(result[i].boundingPoly, result[j].boundingPoly)) {
					const mergedAnnotation = mergeBoxes(result[i], result[j]);
					result = [
						...result.slice(0, i),
						...result.slice(i + 1, j),
						...result.slice(j + 1),
						mergedAnnotation,
					];
					merged = true;
					break;
				}
			}
			if (merged) break;
		}
		if (!merged) break;
	}

	return result;
}

/**
 * Clean and merge text annotations from an image.
 *
 * Performs two passes:
 * 1. Merge overlapping boxes
 * 2. Merge vertically aligned and horizontally adjacent boxes
 */
export function cleanTextAnnotations(
	annotations: TextAnnotation[]
): TextAnnotation[] {
	let result = mergeBoxesWithCriteria(annotations, boxesOverlap);
	result = mergeBoxesWithCriteria(result, boxesVerticallyAligned);
	return result;
}
