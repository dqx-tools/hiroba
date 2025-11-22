"""Data models for banner translation."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np
from shapely.geometry import Polygon

if TYPE_CHECKING:
    from matplotlib.path import Path


@dataclass
class Point:
    """Represents a 2D point with x and y coordinates."""

    x: float
    y: float

    def to_array(self) -> np.ndarray:
        """Convert point to numpy array for calculations."""
        return np.array([self.x, self.y])


@dataclass
class BoundingBox:
    """
    Represents a rotated rectangular bounding box defined by four vertices.
    Vertices should be in clockwise order.
    """

    vertices: list[Point]

    @property
    def center(self) -> Point:
        """Calculate center point of the bounding box."""
        x = sum(p.x for p in self.vertices) / 4
        y = sum(p.y for p in self.vertices) / 4
        return Point(x=x, y=y)

    @property
    def angle(self) -> float:
        """Calculate the rotation angle of the box in radians."""
        dx = self.vertices[1].x - self.vertices[0].x
        dy = self.vertices[1].y - self.vertices[0].y
        return math.atan2(dy, dx)

    @property
    def dimensions(self) -> tuple[float, float]:
        """Calculate width and height of the box."""
        distances = []
        for i in range(4):
            next_i = (i + 1) % 4
            dx = self.vertices[next_i].x - self.vertices[i].x
            dy = self.vertices[next_i].y - self.vertices[i].y
            distances.append(math.sqrt(dx * dx + dy * dy))

        width = (distances[0] + distances[2]) / 2
        height = (distances[1] + distances[3]) / 2
        return width, height

    @property
    def area(self) -> float:
        """Calculate the area of the bounding box."""
        width, height = self.dimensions
        return width * height

    def to_shapely_polygon(self, expand_px: float = 0) -> Polygon:
        """Convert to Shapely Polygon with optional expansion."""
        if expand_px == 0:
            return Polygon([(p.x, p.y) for p in self.vertices])

        min_x = min(p.x for p in self.vertices) - expand_px
        max_x = max(p.x for p in self.vertices) + expand_px
        min_y = min(p.y for p in self.vertices) - expand_px
        max_y = max(p.y for p in self.vertices) + expand_px

        return Polygon([
            (min_x, min_y),
            (max_x, min_y),
            (max_x, max_y),
            (min_x, max_y),
        ])

    def to_numpy(self) -> np.ndarray:
        """Convert vertices to numpy array."""
        return np.array([(p.x, p.y) for p in self.vertices], dtype=np.float32)


@dataclass
class TextAnnotation:
    """Represents a text annotation with a description and bounding polygon."""

    description: str
    bounding_poly: BoundingBox


@dataclass
class TextStyle:
    """Text styling information extracted from an image region."""

    foreground_color: str
    border_color: str
    font_weight: int
    font_size: float


@dataclass
class Slide:
    """A banner slide from the DQX hiroba rotation banner."""

    alt: str | None
    src: str | None
    href: str | None


@dataclass
class TranslatedText:
    """A piece of translated text with its positioning and style."""

    original: str
    translated: str
    bounding_box: BoundingBox
    style: TextStyle
    font_family: str = "Open Sans"
