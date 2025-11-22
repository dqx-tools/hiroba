"""Tests for banner data models."""

import math

import pytest

from src.banner.models import (
    BoundingBox,
    Point,
    Slide,
    TextAnnotation,
    TextStyle,
    TranslatedText,
)


class TestPoint:
    """Tests for Point dataclass."""

    def test_creation(self):
        point = Point(x=10.0, y=20.0)
        assert point.x == 10.0
        assert point.y == 20.0

    def test_to_array(self):
        point = Point(x=10.0, y=20.0)
        arr = point.to_array()
        assert arr[0] == 10.0
        assert arr[1] == 20.0


class TestBoundingBox:
    """Tests for BoundingBox dataclass."""

    @pytest.fixture
    def square_box(self):
        """A simple axis-aligned square box."""
        return BoundingBox(
            vertices=[
                Point(0, 0),
                Point(100, 0),
                Point(100, 100),
                Point(0, 100),
            ]
        )

    @pytest.fixture
    def rotated_box(self):
        """A 45-degree rotated box."""
        return BoundingBox(
            vertices=[
                Point(50, 0),
                Point(100, 50),
                Point(50, 100),
                Point(0, 50),
            ]
        )

    def test_center_square(self, square_box):
        center = square_box.center
        assert center.x == 50.0
        assert center.y == 50.0

    def test_center_rotated(self, rotated_box):
        center = rotated_box.center
        assert center.x == 50.0
        assert center.y == 50.0

    def test_angle_horizontal(self, square_box):
        # First edge is horizontal (0 radians)
        assert abs(square_box.angle) < 0.01

    def test_angle_rotated(self, rotated_box):
        # First edge is at 45 degrees
        expected = math.pi / 4
        assert abs(rotated_box.angle - expected) < 0.01

    def test_dimensions(self, square_box):
        width, height = square_box.dimensions
        assert abs(width - 100) < 0.01
        assert abs(height - 100) < 0.01

    def test_area(self, square_box):
        assert abs(square_box.area - 10000) < 1

    def test_to_shapely_polygon(self, square_box):
        polygon = square_box.to_shapely_polygon()
        assert abs(polygon.area - 10000) < 1

    def test_to_shapely_polygon_expanded(self, square_box):
        polygon = square_box.to_shapely_polygon(expand_px=10)
        # Expanded by 10 on all sides: 120 x 120
        assert polygon.area > 10000

    def test_to_numpy(self, square_box):
        arr = square_box.to_numpy()
        assert arr.shape == (4, 2)
        assert arr[0][0] == 0
        assert arr[0][1] == 0


class TestTextAnnotation:
    """Tests for TextAnnotation dataclass."""

    def test_creation(self):
        box = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(100, 0),
                Point(100, 50),
                Point(0, 50),
            ]
        )
        annotation = TextAnnotation(description="テスト", bounding_poly=box)
        assert annotation.description == "テスト"
        assert annotation.bounding_poly == box


class TestTextStyle:
    """Tests for TextStyle dataclass."""

    def test_creation(self):
        style = TextStyle(
            foreground_color="#ffffff",
            border_color="#000000",
            font_weight=700,
            font_size=24.0,
        )
        assert style.foreground_color == "#ffffff"
        assert style.border_color == "#000000"
        assert style.font_weight == 700
        assert style.font_size == 24.0


class TestSlide:
    """Tests for Slide dataclass."""

    def test_creation(self):
        slide = Slide(
            alt="Test Banner",
            src="https://example.com/banner.jpg",
            href="https://example.com/link",
        )
        assert slide.alt == "Test Banner"
        assert slide.src == "https://example.com/banner.jpg"
        assert slide.href == "https://example.com/link"

    def test_optional_fields(self):
        slide = Slide(alt=None, src=None, href=None)
        assert slide.alt is None
        assert slide.src is None
        assert slide.href is None


class TestTranslatedText:
    """Tests for TranslatedText dataclass."""

    def test_creation(self):
        box = BoundingBox(
            vertices=[
                Point(0, 0),
                Point(100, 0),
                Point(100, 50),
                Point(0, 50),
            ]
        )
        style = TextStyle(
            foreground_color="#ffffff",
            border_color="#000000",
            font_weight=700,
            font_size=24.0,
        )
        text = TranslatedText(
            original="テスト",
            translated="Test",
            bounding_box=box,
            style=style,
            font_family="Roboto",
        )
        assert text.original == "テスト"
        assert text.translated == "Test"
        assert text.font_family == "Roboto"

    def test_default_font_family(self):
        box = BoundingBox(vertices=[Point(0, 0)] * 4)
        style = TextStyle("#fff", "#000", 400, 12.0)
        text = TranslatedText(
            original="テスト",
            translated="Test",
            bounding_box=box,
            style=style,
        )
        assert text.font_family == "Open Sans"
