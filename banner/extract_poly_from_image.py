import numpy as np
import cv2
from PIL import Image
from clean_bounding_boxes import BoundingBox

def order_points(pts):
  """Order points in clockwise order starting from top-left."""
  rect = np.zeros((4, 2), dtype=np.float32)

  # Top-left will have smallest sum
  # Bottom-right will have largest sum
  s = pts.sum(axis=1)
  rect[0] = pts[np.argmin(s)]
  rect[2] = pts[np.argmax(s)]

  # Top-right will have smallest difference
  # Bottom-left will have largest difference
  diff = np.diff(pts, axis=1)
  rect[1] = pts[np.argmin(diff)]
  rect[3] = pts[np.argmax(diff)]

  return rect


def extract_box(image: Image, box: BoundingBox) -> Image:
  """Extract and rectify a bounding box region from the image."""
  # Convert points to numpy array and order them
  image = np.array(image)
  pts = np.array([(vertex.x, vertex.y) for vertex in box.vertices], dtype=np.float32)
  rect = order_points(pts)

  # Get width and height of the rectified image
  width_a = np.sqrt(((rect[2][0] - rect[3][0]) ** 2) + ((rect[2][1] - rect[3][1]) ** 2))
  width_b = np.sqrt(((rect[1][0] - rect[0][0]) ** 2) + ((rect[1][1] - rect[0][1]) ** 2))
  max_width = max(int(width_a), int(width_b))

  height_a = np.sqrt(((rect[1][0] - rect[2][0]) ** 2) + ((rect[1][1] - rect[2][1]) ** 2))
  height_b = np.sqrt(((rect[0][0] - rect[3][0]) ** 2) + ((rect[0][1] - rect[3][1]) ** 2))
  max_height = max(int(height_a), int(height_b))

  # Define destination points for perspective transform
  dst = np.array([
    [0, 0],
    [max_width - 1, 0],
    [max_width - 1, max_height - 1],
    [0, max_height - 1]
  ], dtype=np.float32)

  # Calculate perspective transform matrix and apply it
  matrix = cv2.getPerspectiveTransform(rect, dst)
  warped = cv2.warpPerspective(image, matrix, (max_width, max_height))

  return Image.fromarray(warped)
