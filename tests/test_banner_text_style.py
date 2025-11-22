"""Tests for text style extraction utilities."""

import numpy as np
import pytest
from PIL import Image

from src.banner.text_style import (
    closest_color,
    get_dominant_colors,
    hex_to_rgb,
    image_to_data_uri,
    rgb_to_hex,
)


class TestColorConversions:
    """Tests for color conversion functions."""

    def test_rgb_to_hex(self):
        assert rgb_to_hex((255, 0, 0)) == "#ff0000"
        assert rgb_to_hex((0, 255, 0)) == "#00ff00"
        assert rgb_to_hex((0, 0, 255)) == "#0000ff"
        assert rgb_to_hex((255, 255, 255)) == "#ffffff"
        assert rgb_to_hex((0, 0, 0)) == "#000000"

    def test_hex_to_rgb(self):
        assert hex_to_rgb("#ff0000") == (255, 0, 0)
        assert hex_to_rgb("#00ff00") == (0, 255, 0)
        assert hex_to_rgb("#0000ff") == (0, 0, 255)
        assert hex_to_rgb("#ffffff") == (255, 255, 255)
        assert hex_to_rgb("#000000") == (0, 0, 0)

    def test_hex_to_rgb_without_hash(self):
        assert hex_to_rgb("ff0000") == (255, 0, 0)

    def test_roundtrip(self):
        original = (128, 64, 32)
        assert hex_to_rgb(rgb_to_hex(original)) == original


class TestClosestColor:
    """Tests for closest_color function."""

    def test_exact_match(self):
        colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]
        assert closest_color(colors, (255, 0, 0)) == (255, 0, 0)

    def test_closest_match(self):
        colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]
        # Slightly off red should match red
        result = closest_color(colors, (250, 10, 5))
        assert result == (255, 0, 0)

    def test_midpoint_color(self):
        colors = [(0, 0, 0), (255, 255, 255)]
        # Gray should match one of them (distance is equal, picks first by index)
        result = closest_color(colors, (128, 128, 128))
        assert result in colors


class TestGetDominantColors:
    """Tests for get_dominant_colors function."""

    def test_single_color_image(self):
        # Create a solid red image
        img = Image.new("RGB", (100, 100), color=(255, 0, 0))
        colors = get_dominant_colors(img, num_colors=3)
        # Should have red as dominant
        assert len(colors) == 3
        # First color should be close to red
        assert colors[0][0] > 200  # R channel high

    def test_two_color_image(self):
        # Create image with two colors
        img = Image.new("RGB", (100, 100), color=(255, 0, 0))
        # Fill bottom half with blue
        pixels = img.load()
        for y in range(50, 100):
            for x in range(100):
                pixels[x, y] = (0, 0, 255)

        colors = get_dominant_colors(img, num_colors=2)
        assert len(colors) == 2

    def test_returns_requested_number(self):
        img = Image.new("RGB", (100, 100), color=(128, 128, 128))
        colors = get_dominant_colors(img, num_colors=5)
        assert len(colors) == 5


class TestImageToDataUri:
    """Tests for image_to_data_uri function."""

    def test_creates_valid_data_uri(self):
        img = Image.new("RGB", (10, 10), color=(255, 0, 0))
        uri = image_to_data_uri(img)
        assert uri.startswith("data:image/png;base64,")

    def test_different_images_different_uris(self):
        img1 = Image.new("RGB", (10, 10), color=(255, 0, 0))
        img2 = Image.new("RGB", (10, 10), color=(0, 255, 0))
        uri1 = image_to_data_uri(img1)
        uri2 = image_to_data_uri(img2)
        assert uri1 != uri2
