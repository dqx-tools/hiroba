"""Image inpainting to remove text regions."""

import cv2
import numpy as np
from PIL import Image
from shapely.geometry import Polygon

from .models import TextAnnotation


def inpaint_text_regions(
    image: Image.Image,
    annotations: list[TextAnnotation],
    inpaint_method: int = cv2.INPAINT_TELEA,
    inpaint_radius: int = 3,
    expand_px: float = 1,
) -> Image.Image:
    """
    Inpaint regions of an image specified by text annotations.

    Args:
        image: PIL Image to inpaint
        annotations: List of TextAnnotation objects defining regions to inpaint
        inpaint_method: OpenCV inpaint method (cv2.INPAINT_TELEA or cv2.INPAINT_NS)
        inpaint_radius: Radius of circular neighborhood for inpainting
        expand_px: Optional expansion of bounding boxes in pixels

    Returns:
        PIL Image with text regions inpainted
    """
    img_array = np.array(image)

    # Create mask for inpainting (white where we want to inpaint)
    mask = np.zeros(img_array.shape[:2], dtype=np.uint8)

    for annotation in annotations:
        bbox = annotation.bounding_poly
        vertices = np.array(
            [(int(p.x), int(p.y)) for p in bbox.vertices], np.int32
        )

        if expand_px > 0:
            polygon = Polygon(vertices.reshape((-1, 2)))
            expanded_polygon = polygon.buffer(expand_px)
            if expanded_polygon.geom_type == "Polygon":
                expanded_coords = np.array(expanded_polygon.exterior.coords, np.int32)
                vertices = expanded_coords.reshape((-1, 1, 2))
            else:
                vertices = vertices.reshape((-1, 1, 2))
        else:
            vertices = vertices.reshape((-1, 1, 2))

        cv2.fillPoly(mask, [vertices], 255)

    inpainted = cv2.inpaint(img_array, mask, inpaint_radius, inpaint_method)
    return Image.fromarray(inpainted)
