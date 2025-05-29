import requests
import numpy as np
import cv2
from PIL import Image
from io import BytesIO
from typing import List
from clean_bounding_boxes import TextAnnotation
from shapely.geometry import Polygon


def inpaint_bounding_boxes(
    image_url: str,
    bounding_boxes: List[TextAnnotation],
    inpaint_method: int = cv2.INPAINT_TELEA,
    inpaint_radius: int = 3,
    expand_px: float = 1,
) -> Image:
  """
  Inpaint regions of an image specified by bounding boxes.

  Args:
      image_url (str): URL of the image to inpaint
      bounding_boxes (List[Union[BoundingBox, TextAnnotation]]): List of BoundingBox or TextAnnotation objects
      inpaint_method (int): OpenCV inpaint method (cv2.INPAINT_TELEA or cv2.INPAINT_NS)
      inpaint_radius (int): Radius of a circular neighborhood of each point inpainted
      expand_px (float): Optional expansion of bounding boxes in pixels

  Returns:
      np.ndarray: The inpainted image

  Example:
      ```python
      image_url = "https://example.com/image.jpg"
      box1 = BoundingBox(vertices=[
          Point(100, 100), Point(150, 100),
          Point(150, 150), Point(100, 150)
      ])
      box2 = TextAnnotation(
          description="Sample text",
          bounding_poly=BoundingBox(vertices=[
              Point(200, 200), Point(260, 200),
              Point(260, 230), Point(200, 230)
          ])
      )
      result = inpaint_bounding_boxes(image_url, [box1, box2])
      ```
  """
  # Download image from URL
  try:
    response = requests.get(image_url, timeout=10)
    response.raise_for_status()

    # Convert to OpenCV format
    image = np.array(Image.open(BytesIO(response.content)))

  except requests.exceptions.RequestException as e:
    raise Exception(f"Error downloading image: {str(e)}")
  except Exception as e:
    raise Exception(f"Error processing image: {str(e)}")

  # Create mask for inpainting (white where we want to inpaint)
  mask = np.zeros(image.shape[:2], dtype=np.uint8)

  # Process each bounding box
  for box in bounding_boxes:
    # Extract BoundingBox from TextAnnotation if needed
    bbox = box.bounding_poly

    # Convert vertices to numpy array of points for drawing
    vertices = np.array([(int(p.x), int(p.y)) for p in bbox.vertices], np.int32)

    # Expand the polygon if expand_px > 0
    if expand_px > 0:
      # Convert to Shapely polygon for expansion
      polygon = Polygon(vertices.reshape((-1, 2)))
      # Buffer expands in all directions by the specified distance
      expanded_polygon = polygon.buffer(expand_px)
      # Extract the coordinates from the expanded polygon
      if expanded_polygon.geom_type == 'Polygon':
        expanded_coords = np.array(expanded_polygon.exterior.coords, np.int32)
        vertices = expanded_coords.reshape((-1, 1, 2))
      else:
        # In case the buffer operation creates a multi-polygon or other geom type
        vertices = vertices.reshape((-1, 1, 2))
    else:
      vertices = vertices.reshape((-1, 1, 2))

    # Fill the polygon in the mask
    cv2.fillPoly(mask, [vertices], 255)

  # Perform inpainting
  return Image.fromarray(cv2.inpaint(image, mask, inpaint_radius, inpaint_method))
