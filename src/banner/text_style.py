"""Text style extraction from image regions."""

from __future__ import annotations

import base64
from collections import Counter
from io import BytesIO
from json import loads
from typing import TYPE_CHECKING

import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

from .models import TextStyle

if TYPE_CHECKING:
    from openai import OpenAI

RGB = tuple[int, int, int]

STYLE_PROMPT = """
Describe the text styling in this image. Respond in the form of a JSON object with keys for the text
foreground color, the text border/drop shadow color, and approximate font weight. Provide the colors
as hex codes, and font weight as a number from 100-900. Respond only with JSON. Do not analyze, do
it yourself.
"""

STYLE_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "text_style",
        "schema": {
            "type": "object",
            "properties": {
                "foreground_color": {
                    "type": "string",
                    "description": "The foreground color of the text",
                },
                "border_color": {
                    "type": "string",
                    "description": "The text border or drop shadow color.",
                },
                "font_weight": {
                    "type": "integer",
                    "description": "The approximate font weight of the text",
                    "minimum": 100,
                    "maximum": 900,
                },
            },
            "required": ["foreground_color", "border_color", "font_weight"],
        },
    },
}


def image_to_data_uri(image: Image.Image) -> str:
    """Convert PIL Image to data URI."""
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    img_str = base64.b64encode(buffer.getvalue())
    return f"data:image/png;base64,{img_str.decode('utf-8')}"


def get_dominant_colors(image: Image.Image, num_colors: int = 5) -> list[RGB]:
    """Extract dominant colors from an image using K-means clustering."""
    img = image.convert("RGB")
    img_array = np.array(img)
    pixels = img_array.reshape(-1, 3)

    kmeans = KMeans(n_clusters=num_colors, n_init=10)
    kmeans.fit(pixels)

    colors = kmeans.cluster_centers_.astype(int)
    labels = kmeans.labels_
    counts = Counter(labels)
    total_pixels = sum(counts.values())

    color_percentages = [
        (tuple(int(c) for c in color), count / total_pixels * 100)
        for color, count in zip(colors, [counts[i] for i in range(num_colors)])
    ]

    color_percentages.sort(key=lambda x: x[1], reverse=True)
    return [color[0] for color in color_percentages]


def closest_color(colors: list[RGB], target: RGB) -> RGB:
    """Find the closest color in a list to the target color."""
    colors_arr = np.array(colors)
    target_arr = np.array(target)
    distances = np.sqrt(np.sum((colors_arr - target_arr) ** 2, axis=1))
    index = np.argmin(distances)
    return tuple(int(c) for c in colors_arr[index])


def rgb_to_hex(rgb: RGB) -> str:
    """Convert RGB tuple to hex color string."""
    return "#{:02x}{:02x}{:02x}".format(rgb[0], rgb[1], rgb[2])


def hex_to_rgb(hexcode: str) -> RGB:
    """Convert hex color string to RGB tuple."""
    return tuple(bytes.fromhex(hexcode.lstrip("#")))


class TextStyleExtractor:
    """Extracts text styling from image regions using OpenAI vision."""

    def __init__(self, client: OpenAI, model: str = "gpt-4o"):
        self.client = client
        self.model = model

    def _get_raw_style(self, image: Image.Image) -> dict:
        """Get raw text style from OpenAI."""
        image_data_uri = image_to_data_uri(image)

        completion = self.client.chat.completions.create(
            model=self.model,
            response_format=STYLE_RESPONSE_FORMAT,
            messages=[
                {"role": "system", "content": STYLE_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": image_data_uri}}
                    ],
                },
            ],
        )
        return loads(completion.choices[0].message.content)

    def extract(self, image: Image.Image) -> TextStyle:
        """
        Extract text style from an image region.

        Uses OpenAI to identify colors, then snaps them to dominant
        colors in the image for accuracy.
        """
        colors = get_dominant_colors(image, num_colors=5)
        raw_style = self._get_raw_style(image)

        # Snap colors to dominant colors in the image
        fg_rgb = hex_to_rgb(raw_style["foreground_color"])
        foreground_color = rgb_to_hex(closest_color(colors, fg_rgb))

        border_rgb = hex_to_rgb(raw_style["border_color"])
        border_color = rgb_to_hex(closest_color(colors, border_rgb))

        return TextStyle(
            foreground_color=foreground_color,
            border_color=border_color,
            font_weight=raw_style["font_weight"],
            font_size=image.height * 0.8,
        )
