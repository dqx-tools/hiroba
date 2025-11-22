"""Tests for SVG renderer."""

import pytest
from PIL import Image

from src.banner.models import BoundingBox, Point, TextStyle, TranslatedText
from src.banner.renderer import render_svg


class TestRenderSvg:
    """Tests for render_svg function."""

    @pytest.fixture
    def sample_image(self):
        """Create a small test image."""
        return Image.new("RGB", (200, 100), color=(255, 255, 255))

    @pytest.fixture
    def sample_text(self):
        """Create a sample translated text."""
        return TranslatedText(
            original="テスト",
            translated="Test",
            bounding_box=BoundingBox(
                vertices=[
                    Point(50, 25),
                    Point(150, 25),
                    Point(150, 75),
                    Point(50, 75),
                ]
            ),
            style=TextStyle(
                foreground_color="#ffffff",
                border_color="#000000",
                font_weight=700,
                font_size=24.0,
            ),
            font_family="Open Sans",
        )

    def test_produces_valid_svg(self, sample_image, sample_text):
        svg = render_svg(sample_image, [sample_text])
        assert svg.startswith("<svg")
        assert svg.endswith("</svg>")
        assert 'xmlns="http://www.w3.org/2000/svg"' in svg

    def test_includes_dimensions(self, sample_image, sample_text):
        svg = render_svg(sample_image, [sample_text])
        assert 'width="200"' in svg
        assert 'height="100"' in svg

    def test_includes_background_image(self, sample_image, sample_text):
        svg = render_svg(sample_image, [sample_text])
        assert "<image" in svg
        assert "data:image/png;base64," in svg

    def test_includes_text_element(self, sample_image, sample_text):
        svg = render_svg(sample_image, [sample_text])
        assert "<text" in svg
        assert "Test</text>" in svg

    def test_includes_text_styling(self, sample_image, sample_text):
        svg = render_svg(sample_image, [sample_text])
        assert 'fill="#ffffff"' in svg
        assert 'stroke="#000000"' in svg
        assert 'font-weight="700"' in svg
        assert 'font-family="Open Sans"' in svg

    def test_empty_texts_produces_valid_svg(self, sample_image):
        svg = render_svg(sample_image, [])
        assert svg.startswith("<svg")
        assert svg.endswith("</svg>")
        assert "<text" not in svg

    def test_escapes_special_characters(self, sample_image):
        text = TranslatedText(
            original="テスト",
            translated="Test <>&",
            bounding_box=BoundingBox(
                vertices=[Point(0, 0)] * 4
            ),
            style=TextStyle("#fff", "#000", 400, 12.0),
        )
        svg = render_svg(sample_image, [text])
        # Special characters should be escaped
        assert "&lt;" in svg
        assert "&gt;" in svg
        assert "&amp;" in svg

    def test_multiple_texts(self, sample_image):
        texts = [
            TranslatedText(
                original="A",
                translated="Text A",
                bounding_box=BoundingBox(
                    vertices=[
                        Point(0, 0),
                        Point(50, 0),
                        Point(50, 25),
                        Point(0, 25),
                    ]
                ),
                style=TextStyle("#fff", "#000", 400, 12.0),
            ),
            TranslatedText(
                original="B",
                translated="Text B",
                bounding_box=BoundingBox(
                    vertices=[
                        Point(100, 0),
                        Point(150, 0),
                        Point(150, 25),
                        Point(100, 25),
                    ]
                ),
                style=TextStyle("#000", "#fff", 700, 14.0),
            ),
        ]
        svg = render_svg(sample_image, texts)
        assert svg.count("<text") == 2
        assert "Text A" in svg
        assert "Text B" in svg
