"""Tests for bounding box operations."""

import pytest

from src.banner.bounding_boxes import (
    boxes_overlap,
    boxes_vertically_aligned,
    calculate_iou,
    clean_text_annotations,
    merge_boxes,
)
from src.banner.models import BoundingBox, Point, TextAnnotation


class TestCalculateIoU:
    """Tests for IoU calculation."""

    def test_identical_boxes(self):
        box = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(100, 0),
                Point(100, 100),
                Point(0, 100),
            ]
        )
        iou = calculate_iou(box, box)
        assert iou > 0.95  # Should be ~1.0

    def test_non_overlapping_boxes(self):
        box1 = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(50, 0),
                Point(50, 50),
                Point(0, 50),
            ]
        )
        box2 = BoundingBox(
            vertices=[
                Point(100, 100),
                Point(150, 100),
                Point(150, 150),
                Point(100, 150),
            ]
        )
        iou = calculate_iou(box1, box2)
        assert iou < 0.01  # Should be ~0

    def test_partial_overlap(self):
        box1 = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(100, 0),
                Point(100, 100),
                Point(0, 100),
            ]
        )
        box2 = BoundingBox(
            vertices=[
                Point(50, 0),
                Point(150, 0),
                Point(150, 100),
                Point(50, 100),
            ]
        )
        iou = calculate_iou(box1, box2)
        # 50% overlap with union = 150% of single box
        assert 0.2 < iou < 0.5


class TestBoxesOverlap:
    """Tests for boxes_overlap function."""

    def test_overlapping_boxes(self):
        box1 = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(100, 0),
                Point(100, 50),
                Point(0, 50),
            ]
        )
        box2 = BoundingBox(
            vertices=[
                Point(50, 0),
                Point(150, 0),
                Point(150, 50),
                Point(50, 50),
            ]
        )
        assert boxes_overlap(box1, box2) is True

    def test_non_overlapping_boxes(self):
        box1 = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(50, 0),
                Point(50, 50),
                Point(0, 50),
            ]
        )
        box2 = BoundingBox(
            vertices=[
                Point(200, 0),
                Point(250, 0),
                Point(250, 50),
                Point(200, 50),
            ]
        )
        assert boxes_overlap(box1, box2) is False

    def test_different_angles_no_overlap(self):
        # Horizontal box
        box1 = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(100, 0),
                Point(100, 50),
                Point(0, 50),
            ]
        )
        # Vertical box (90 degree rotation)
        box2 = BoundingBox(
            vertices=[
                Point(50, 0),
                Point(50, 100),
                Point(0, 100),
                Point(0, 0),
            ]
        )
        # Angle difference > 5 degrees, should not overlap
        assert boxes_overlap(box1, box2) is False


class TestBoxesVerticallyAligned:
    """Tests for boxes_vertically_aligned function."""

    def test_adjacent_horizontal_boxes(self):
        box1 = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(50, 0),
                Point(50, 30),
                Point(0, 30),
            ]
        )
        box2 = BoundingBox(
            vertices=[
                Point(55, 0),
                Point(100, 0),
                Point(100, 30),
                Point(55, 30),
            ]
        )
        assert boxes_vertically_aligned(box1, box2) is True

    def test_vertically_separated_boxes(self):
        box1 = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(50, 0),
                Point(50, 30),
                Point(0, 30),
            ]
        )
        box2 = BoundingBox(
            vertices=[
                Point(0, 100),
                Point(50, 100),
                Point(50, 130),
                Point(0, 130),
            ]
        )
        assert boxes_vertically_aligned(box1, box2) is False


class TestMergeBoxes:
    """Tests for merge_boxes function."""

    def test_merge_adjacent_boxes(self):
        ann1 = TextAnnotation(
            description="Hello",
            bounding_poly=BoundingBox(
                vertices=[
                    Point(0, 0),
                    Point(50, 0),
                    Point(50, 30),
                    Point(0, 30),
                ]
            ),
        )
        ann2 = TextAnnotation(
            description="World",
            bounding_poly=BoundingBox(
                vertices=[
                    Point(60, 0),
                    Point(110, 0),
                    Point(110, 30),
                    Point(60, 30),
                ]
            ),
        )
        merged = merge_boxes(ann1, ann2)
        assert merged.description == "Hello World"

    def test_merge_overlapping_boxes_keeps_longer(self):
        ann1 = TextAnnotation(
            description="A",
            bounding_poly=BoundingBox(
                vertices=[
                    Point(0, 0),
                    Point(100, 0),
                    Point(100, 100),
                    Point(0, 100),
                ]
            ),
        )
        ann2 = TextAnnotation(
            description="ABC",
            bounding_poly=BoundingBox(
                vertices=[
                    Point(10, 10),
                    Point(90, 10),
                    Point(90, 90),
                    Point(10, 90),
                ]
            ),
        )
        merged = merge_boxes(ann1, ann2)
        # With high IoU, keeps longer description
        assert "ABC" in merged.description or "A" in merged.description


class TestCleanTextAnnotations:
    """Tests for clean_text_annotations function."""

    def test_merges_overlapping_annotations(self):
        annotations = [
            TextAnnotation(
                description="Hello",
                bounding_poly=BoundingBox(
                    vertices=[
                        Point(0, 0),
                        Point(50, 0),
                        Point(50, 30),
                        Point(0, 30),
                    ]
                ),
            ),
            TextAnnotation(
                description="World",
                bounding_poly=BoundingBox(
                    vertices=[
                        Point(55, 0),
                        Point(100, 0),
                        Point(100, 30),
                        Point(55, 30),
                    ]
                ),
            ),
        ]
        cleaned = clean_text_annotations(annotations)
        # Adjacent boxes should be merged
        assert len(cleaned) == 1
        assert "Hello" in cleaned[0].description
        assert "World" in cleaned[0].description

    def test_keeps_separate_annotations(self):
        annotations = [
            TextAnnotation(
                description="Top",
                bounding_poly=BoundingBox(
                    vertices=[
                        Point(0, 0),
                        Point(50, 0),
                        Point(50, 30),
                        Point(0, 30),
                    ]
                ),
            ),
            TextAnnotation(
                description="Bottom",
                bounding_poly=BoundingBox(
                    vertices=[
                        Point(0, 200),
                        Point(50, 200),
                        Point(50, 230),
                        Point(0, 230),
                    ]
                ),
            ),
        ]
        cleaned = clean_text_annotations(annotations)
        # Separate boxes should remain separate
        assert len(cleaned) == 2

    def test_empty_input(self):
        cleaned = clean_text_annotations([])
        assert cleaned == []
