"""Image loading and manipulation utilities."""

from io import BytesIO

import cv2
import httpx
import numpy as np
from PIL import Image

from .models import BoundingBox


async def load_image_from_url(
    url: str, client: httpx.AsyncClient | None = None
) -> Image.Image:
    """
    Load an image from a URL.

    Args:
        url: URL of the image to load
        client: Optional httpx client to use

    Returns:
        PIL Image object
    """
    if client is None:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
    else:
        response = await client.get(url)

    response.raise_for_status()
    return Image.open(BytesIO(response.content))


def order_points(pts: np.ndarray) -> np.ndarray:
    """Order points in clockwise order starting from top-left."""
    rect = np.zeros((4, 2), dtype=np.float32)

    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]

    return rect


def extract_box_region(image: Image.Image, box: BoundingBox) -> Image.Image:
    """
    Extract and rectify a bounding box region from the image.

    Applies perspective transform to get a straight rectangular region.

    Args:
        image: Source PIL Image
        box: BoundingBox defining the region to extract

    Returns:
        PIL Image of the extracted and rectified region
    """
    img_array = np.array(image)
    pts = box.to_numpy()
    rect = order_points(pts)

    width_a = np.sqrt(((rect[2][0] - rect[3][0]) ** 2) + ((rect[2][1] - rect[3][1]) ** 2))
    width_b = np.sqrt(((rect[1][0] - rect[0][0]) ** 2) + ((rect[1][1] - rect[0][1]) ** 2))
    max_width = max(int(width_a), int(width_b))

    height_a = np.sqrt(((rect[1][0] - rect[2][0]) ** 2) + ((rect[1][1] - rect[2][1]) ** 2))
    height_b = np.sqrt(((rect[0][0] - rect[3][0]) ** 2) + ((rect[0][1] - rect[3][1]) ** 2))
    max_height = max(int(height_a), int(height_b))

    dst = np.array(
        [
            [0, 0],
            [max_width - 1, 0],
            [max_width - 1, max_height - 1],
            [0, max_height - 1],
        ],
        dtype=np.float32,
    )

    matrix = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(img_array, matrix, (max_width, max_height))

    return Image.fromarray(warped)
