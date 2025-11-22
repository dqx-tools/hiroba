"""Bounding box cleaning and merging utilities."""

from __future__ import annotations

import math
from typing import Callable

import numpy as np
from matplotlib.path import Path

from .models import BoundingBox, Point, TextAnnotation


def calculate_iou(box1: BoundingBox, box2: BoundingBox) -> float:
    """Calculate intersection over union of two boxes."""
    poly1 = np.array([[p.x, p.y] for p in box1.vertices])
    poly2 = np.array([[p.x, p.y] for p in box2.vertices])

    path1 = Path(poly1)
    path2 = Path(poly2)

    x_min = min(min(p.x for p in box1.vertices), min(p.x for p in box2.vertices))
    x_max = max(max(p.x for p in box1.vertices), max(p.x for p in box2.vertices))
    y_min = min(min(p.y for p in box1.vertices), min(p.y for p in box2.vertices))
    y_max = max(max(p.y for p in box1.vertices), max(p.y for p in box2.vertices))

    x = np.linspace(x_min, x_max, 100)
    y = np.linspace(y_min, y_max, 100)
    xv, yv = np.meshgrid(x, y)
    points = np.column_stack((xv.flatten(), yv.flatten()))

    mask1 = path1.contains_points(points)
    mask2 = path2.contains_points(points)
    intersection = np.logical_and(mask1, mask2).sum()
    union = np.logical_or(mask1, mask2).sum()

    return intersection / union if union > 0 else 0


def boxes_overlap(box1: BoundingBox, box2: BoundingBox) -> bool:
    """
    Check if two boxes overlap or are very close to each other.

    Criteria:
    1. Boxes must be within 5 degrees of aligned
    2. Y centerpoints must be within half of either box's height
    3. Boxes must intersect
    """
    angle_diff = abs(box1.angle - box2.angle)
    angle_diff = min(angle_diff, 2 * math.pi - angle_diff)

    if math.degrees(angle_diff) > 5:
        return False

    reference_angle = (box1.angle + box2.angle) / 2
    cos_angle = math.cos(-reference_angle)
    sin_angle = math.sin(-reference_angle)

    center1 = box1.center
    center2 = box2.center

    x2_centered = center2.x - center1.x
    y2_centered = center2.y - center1.y
    y2_rotated = x2_centered * sin_angle + y2_centered * cos_angle

    y_center_diff = abs(y2_rotated)

    _, height1 = box1.dimensions
    _, height2 = box2.dimensions

    max_allowed_diff = min(height1, height2) / 2
    if y_center_diff > max_allowed_diff:
        return False

    polygon1 = box1.to_shapely_polygon()
    polygon2 = box2.to_shapely_polygon()

    return polygon1.intersects(polygon2)


def boxes_vertically_aligned(box1: BoundingBox, box2: BoundingBox) -> bool:
    """
    Check if two boxes are vertically aligned and horizontally adjacent.

    Criteria:
    1. Boxes must be within 5 degrees of aligned
    2. Vertical overlap must be at least 50% of the smaller box's height
    3. Horizontal distance must be less than half the average height
    """
    angle_diff = abs(box1.angle - box2.angle)
    angle_diff = min(angle_diff, 2 * math.pi - angle_diff)
    if math.degrees(angle_diff) > 5:
        return False

    reference_angle = box1.angle
    cos_angle = math.cos(-reference_angle)
    sin_angle = math.sin(-reference_angle)

    def rotate_points(box: BoundingBox, center_x: float, center_y: float):
        rotated = []
        for point in box.vertices:
            x_centered = point.x - center_x
            y_centered = point.y - center_y
            x_rotated = x_centered * cos_angle - y_centered * sin_angle
            y_rotated = x_centered * sin_angle + y_centered * cos_angle
            rotated.append((x_rotated, y_rotated))
        return rotated

    center_x = box1.center.x
    center_y = box1.center.y
    rotated_box1 = rotate_points(box1, center_x, center_y)
    rotated_box2 = rotate_points(box2, center_x, center_y)

    box1_min_y = min(p[1] for p in rotated_box1)
    box1_max_y = max(p[1] for p in rotated_box1)
    box2_min_y = min(p[1] for p in rotated_box2)
    box2_max_y = max(p[1] for p in rotated_box2)

    box1_min_x = min(p[0] for p in rotated_box1)
    box1_max_x = max(p[0] for p in rotated_box1)
    box2_min_x = min(p[0] for p in rotated_box2)
    box2_max_x = max(p[0] for p in rotated_box2)

    box1_height = box1_max_y - box1_min_y
    box2_height = box2_max_y - box2_min_y
    avg_height = (box1_height + box2_height) / 2

    min_overlap = min(box1_height, box2_height) * 0.5
    y_overlap = min(box1_max_y, box2_max_y) - max(box1_min_y, box2_min_y)
    if y_overlap < min_overlap:
        return False

    if box1_max_x < box2_min_x:
        h_distance = box2_min_x - box1_max_x
    elif box2_max_x < box1_min_x:
        h_distance = box1_min_x - box2_max_x
    else:
        h_distance = 0

    return h_distance < avg_height / 2


def merge_boxes(ann1: TextAnnotation, ann2: TextAnnotation) -> TextAnnotation:
    """Merge two text annotations while preserving rotation."""
    iou = calculate_iou(ann1.bounding_poly, ann2.bounding_poly)

    box1_area = ann1.bounding_poly.area
    box2_area = ann2.bounding_poly.area

    polygon1 = ann1.bounding_poly.to_shapely_polygon()
    polygon2 = ann2.bounding_poly.to_shapely_polygon()

    intersection_area = polygon1.intersection(polygon2).area

    containment_1_in_2 = intersection_area / polygon1.area if polygon1.area > 0 else 0
    containment_2_in_1 = intersection_area / polygon2.area if polygon2.area > 0 else 0

    if containment_1_in_2 > 0.95 or containment_2_in_1 > 0.95:
        description = ann1.description if box1_area >= box2_area else ann2.description
    elif iou > 0.5:
        description = (
            ann1.description
            if len(ann1.description) >= len(ann2.description)
            else ann2.description
        )
    else:
        if ann1.bounding_poly.center.x <= ann2.bounding_poly.center.x:
            description = f"{ann1.description} {ann2.description}"
        else:
            description = f"{ann2.description} {ann1.description}"

    merged_angle = (
        ann1.bounding_poly.angle if box1_area >= box2_area else ann2.bounding_poly.angle
    )

    all_vertices = ann1.bounding_poly.vertices + ann2.bounding_poly.vertices

    cos_angle = math.cos(-merged_angle)
    sin_angle = math.sin(-merged_angle)

    rotated_points = []
    for point in all_vertices:
        x_centered = point.x - ann1.bounding_poly.center.x
        y_centered = point.y - ann1.bounding_poly.center.y

        x_rotated = x_centered * cos_angle - y_centered * sin_angle
        y_rotated = x_centered * sin_angle + y_centered * cos_angle

        rotated_points.append((x_rotated, y_rotated))

    x_min_rot = min(p[0] for p in rotated_points)
    x_max_rot = max(p[0] for p in rotated_points)
    y_min_rot = min(p[1] for p in rotated_points)
    y_max_rot = max(p[1] for p in rotated_points)

    corners_rot = [
        (x_min_rot, y_min_rot),
        (x_max_rot, y_min_rot),
        (x_max_rot, y_max_rot),
        (x_min_rot, y_max_rot),
    ]

    merged_center = ann1.bounding_poly.center
    merged_vertices = []
    for x_rot, y_rot in corners_rot:
        x_orig = x_rot * cos_angle + y_rot * sin_angle
        y_orig = -x_rot * sin_angle + y_rot * cos_angle

        x = x_orig + merged_center.x
        y = y_orig + merged_center.y

        merged_vertices.append(Point(x=x, y=y))

    return TextAnnotation(
        description=description, bounding_poly=BoundingBox(vertices=merged_vertices)
    )


def merge_boxes_with_criteria(
    annotations: list[TextAnnotation],
    merge_criteria: Callable[[BoundingBox, BoundingBox], bool],
) -> list[TextAnnotation]:
    """Merge boxes based on the provided criteria function."""
    while True:
        merged = False
        for i in range(len(annotations)):
            for j in range(i + 1, len(annotations)):
                if merge_criteria(
                    annotations[i].bounding_poly, annotations[j].bounding_poly
                ):
                    merged_annotation = merge_boxes(annotations[i], annotations[j])

                    annotations = (
                        annotations[:i]
                        + annotations[i + 1 : j]
                        + annotations[j + 1 :]
                        + [merged_annotation]
                    )
                    merged = True
                    break
            if merged:
                break
        if not merged:
            break

    return annotations


def clean_text_annotations(
    annotations: list[TextAnnotation],
) -> list[TextAnnotation]:
    """
    Clean and merge text annotations from an image.

    Performs two passes:
    1. Merge overlapping boxes
    2. Merge vertically aligned and horizontally adjacent boxes
    """
    annotations = merge_boxes_with_criteria(annotations, boxes_overlap)
    annotations = merge_boxes_with_criteria(annotations, boxes_vertically_aligned)
    return annotations
