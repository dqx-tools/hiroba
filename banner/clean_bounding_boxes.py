import numpy as np
from typing import List, Any, Optional, Tuple
from dataclasses import dataclass
import math
from matplotlib.path import Path
from shapely.geometry import Polygon
import PIL.Image as Image
import PIL.ImageDraw as ImageDraw
import urllib.request
import io
import logging

# Set up logging
logger = logging.getLogger(__name__)

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
  vertices: List[Point]  # Four points in clockwise order

  @property
  def center(self) -> Point:
    """Calculate center point of the bounding box."""
    x = sum(p.x for p in self.vertices) / 4
    y = sum(p.y for p in self.vertices) / 4
    return Point(x=x, y=y)

  @property
  def angle(self) -> float:
    """Calculate the rotation angle of the box in radians."""
    # Using the first two points to determine primary direction
    dx = self.vertices[1].x - self.vertices[0].x
    dy = self.vertices[1].y - self.vertices[0].y
    return math.atan2(dy, dx)

  @property
  def dimensions(self) -> Tuple[float, float]:
    """Calculate width and height of the box."""
    # Calculate distances between consecutive points
    distances = []
    for i in range(4):
      next_i = (i + 1) % 4
      dx = self.vertices[next_i].x - self.vertices[i].x
      dy = self.vertices[next_i].y - self.vertices[i].y
      distances.append(math.sqrt(dx * dx + dy * dy))

    # Width is average of parallel sides
    width = (distances[0] + distances[2]) / 2
    height = (distances[1] + distances[3]) / 2
    return width, height

  @property
  def area(self) -> float:
    """Calculate the area of the bounding box."""
    width, height = self.dimensions
    return width * height

  def to_shapely_polygon(self, expand_px: float = 0) -> Polygon:
    """
    Convert to Shapely Polygon with optional expansion.

    Args:
        expand_px: Number of pixels to expand the bounding box in all directions

    Returns:
        Shapely Polygon representing the bounding box
    """
    # If no expansion, simply convert points to polygon
    if expand_px == 0:
      return Polygon([(p.x, p.y) for p in self.vertices])

    # For expansion, calculate the min/max bounds and expand them
    min_x = min(p.x for p in self.vertices) - expand_px
    max_x = max(p.x for p in self.vertices) + expand_px
    min_y = min(p.y for p in self.vertices) - expand_px
    max_y = max(p.y for p in self.vertices) + expand_px

    # Create a new polygon with expanded bounds
    return Polygon([
      (min_x, min_y),  # Top-left
      (max_x, min_y),  # Top-right
      (max_x, max_y),  # Bottom-right
      (min_x, max_y)  # Bottom-left
    ])


@dataclass
class TextAnnotation:
  """Represents a text annotation with a description and bounding polygon."""
  description: str
  bounding_poly: BoundingBox


def calculate_iou(box1: BoundingBox, box2: BoundingBox) -> float:
  """
  Calculate intersection over union of two boxes.

  Args:
      box1: First bounding box
      box2: Second bounding box

  Returns:
      Intersection over union value between 0 and 1
  """
  # Convert boxes to numpy arrays for easier manipulation
  poly1 = np.array([[p.x, p.y] for p in box1.vertices])
  poly2 = np.array([[p.x, p.y] for p in box2.vertices])

  # Create Path objects for intersection calculation
  path1 = Path(poly1)
  path2 = Path(poly2)

  # Create a fine mesh grid that covers both polygons
  x_min = min(min(p.x for p in box1.vertices), min(p.x for p in box2.vertices))
  x_max = max(max(p.x for p in box1.vertices), max(p.x for p in box2.vertices))
  y_min = min(min(p.y for p in box1.vertices), min(p.y for p in box2.vertices))
  y_max = max(max(p.y for p in box1.vertices), max(p.y for p in box2.vertices))

  x = np.linspace(x_min, x_max, 100)
  y = np.linspace(y_min, y_max, 100)
  xv, yv = np.meshgrid(x, y)
  points = np.column_stack((xv.flatten(), yv.flatten()))

  # Calculate areas using point in polygon test
  mask1 = path1.contains_points(points)
  mask2 = path2.contains_points(points)
  intersection = np.logical_and(mask1, mask2).sum()
  union = np.logical_or(mask1, mask2).sum()

  return intersection / union if union > 0 else 0


def boxes_overlap(box1: BoundingBox, box2: BoundingBox) -> bool:
  """
  Check if two boxes overlap or are very close to each other.

  Criteria:
  1. Boxes must be within 5 degrees of aligned
  2. Y centerpoints must be within half of either box's height
  3. Boxes must intersect

  Args:
      box1: First bounding box
      box2: Second bounding box

  Returns:
      True if boxes overlap according to criteria, False otherwise
  """
  # Check angular alignment first
  angle1 = box1.angle
  angle2 = box2.angle

  # Calculate angular difference and normalize to [-pi, pi]
  angle_diff = abs(angle1 - angle2)
  angle_diff = min(angle_diff, 2 * math.pi - angle_diff)

  # Calculate angular difference in degrees
  angle_diff_degrees = math.degrees(angle_diff)

  # If angle difference exceeds 5 degrees, consider boxes not aligned
  if angle_diff_degrees > 5:
    return False

  # Check vertical alignment using center points
  # Since boxes might be rotated, we need to consider the rotated coordinate system
  # We'll use the reference angle (average of both angles) for transformations
  reference_angle = (angle1 + angle2) / 2
  cos_angle = math.cos(-reference_angle)
  sin_angle = math.sin(-reference_angle)

  # Transform centers to rotated coordinate system
  center1 = box1.center
  center2 = box2.center

  # Translate to origin and rotate center1
  x1_centered = center1.x - center1.x  # Will be 0
  y1_centered = center1.y - center1.y  # Will be 0
  y1_rotated = x1_centered * sin_angle + y1_centered * cos_angle  # Will be 0

  # Translate to origin and rotate center2
  x2_centered = center2.x - center1.x
  y2_centered = center2.y - center1.y
  y2_rotated = x2_centered * sin_angle + y2_centered * cos_angle

  # Calculate vertical distance between centers in rotated space
  y_center_diff = abs(y2_rotated - y1_rotated)

  # Get heights of both boxes
  _, height1 = box1.dimensions
  _, height2 = box2.dimensions

  # Check if y centerpoints are within half of either box's height
  max_allowed_diff = min(height1, height2) / 2
  if y_center_diff > max_allowed_diff:
    return False

  # Convert to Shapely polygons and check for intersection
  polygon1 = box1.to_shapely_polygon()
  polygon2 = box2.to_shapely_polygon()

  return polygon1.intersects(polygon2)


def boxes_vertically_aligned(box1: BoundingBox, box2: BoundingBox) -> bool:
  """
  Check if two boxes are vertically aligned and horizontally adjacent.

  Criteria:
  1. Boxes must be within 5 degrees of aligned
  2. Vertical overlap must be at least 50% of the smaller box's height
  3. Horizontal distance must be less than half the average height

  Args:
      box1: First bounding box
      box2: Second bounding box

  Returns:
      True if boxes are vertically aligned and horizontally adjacent, False otherwise
  """
  # Make sure they are similarly rotated (within 5 degrees)
  angle1 = box1.angle
  angle2 = box2.angle
  angle_diff = abs(angle1 - angle2)
  angle_diff = min(angle_diff, 2 * math.pi - angle_diff)
  if math.degrees(angle_diff) > 5:
    return False

  # Use the angle of the first box for transformations
  reference_angle = box1.angle
  cos_angle = math.cos(-reference_angle)
  sin_angle = math.sin(-reference_angle)

  # Transform all vertices to rotated coordinate system
  def rotate_points(box, center_x, center_y):
    rotated = []
    for point in box.vertices:
      # Translate to origin
      x_centered = point.x - center_x
      y_centered = point.y - center_y

      # Rotate
      x_rotated = x_centered * cos_angle - y_centered * sin_angle
      y_rotated = x_centered * sin_angle + y_centered * cos_angle

      rotated.append((x_rotated, y_rotated))
    return rotated

  # Rotate both boxes
  center_x = box1.center.x
  center_y = box1.center.y
  rotated_box1 = rotate_points(box1, center_x, center_y)
  rotated_box2 = rotate_points(box2, center_x, center_y)

  # Calculate min/max y for both boxes in rotated space
  box1_min_y = min(p[1] for p in rotated_box1)
  box1_max_y = max(p[1] for p in rotated_box1)
  box2_min_y = min(p[1] for p in rotated_box2)
  box2_max_y = max(p[1] for p in rotated_box2)

  # Calculate min/max x for both boxes in rotated space
  box1_min_x = min(p[0] for p in rotated_box1)
  box1_max_x = max(p[0] for p in rotated_box1)
  box2_min_x = min(p[0] for p in rotated_box2)
  box2_max_x = max(p[0] for p in rotated_box2)

  # Calculate heights
  box1_height = box1_max_y - box1_min_y
  box2_height = box2_max_y - box2_min_y
  avg_height = (box1_height + box2_height) / 2

  # Check vertical alignment - overlap should be at least 50% of the smaller height
  min_overlap = min(box1_height, box2_height) * 0.5
  y_overlap = min(box1_max_y, box2_max_y) - max(box1_min_y, box2_min_y)
  if y_overlap < min_overlap:
    return False

  # Calculate horizontal distance between boxes
  if box1_max_x < box2_min_x:  # box1 is to the left of box2
    h_distance = box2_min_x - box1_max_x
  elif box2_max_x < box1_min_x:  # box2 is to the left of box1
    h_distance = box1_min_x - box2_max_x
  else:  # boxes overlap horizontally
    h_distance = 0

  # Check if horizontal distance is less than half the average height
  return h_distance < avg_height / 2


def merge_boxes(ann1: TextAnnotation, ann2: TextAnnotation, debug: bool = False) -> TextAnnotation:
  """
  Merge two text annotations while preserving rotation.

  Args:
      ann1: First text annotation
      ann2: Second text annotation
      debug: Whether to print debugging information

  Returns:
      New TextAnnotation representing the merged result
  """
  # Calculate IoU to determine if boxes cover same area
  iou = calculate_iou(ann1.bounding_poly, ann2.bounding_poly)

  # Get areas for size comparison
  box1_area = ann1.bounding_poly.area
  box2_area = ann2.bounding_poly.area

  # Check if one box is much larger and contains the other
  polygon1 = ann1.bounding_poly.to_shapely_polygon()
  polygon2 = ann2.bounding_poly.to_shapely_polygon()

  # Calculate the area of intersection using Shapely
  intersection_area = polygon1.intersection(polygon2).area

  # Calculate containment ratios
  containment_ratio_1_in_2 = intersection_area / polygon1.area if polygon1.area > 0 else 0
  containment_ratio_2_in_1 = intersection_area / polygon2.area if polygon2.area > 0 else 0

  # If one box is almost entirely contained within the other (more than 95%)
  if containment_ratio_1_in_2 > 0.95 or containment_ratio_2_in_1 > 0.95:
    # Determine which box contains the other and use the larger box's description
    if box1_area >= box2_area:
      if debug:
        logger.info(
          f"Box containment detected: '{ann1.description}' contains '{ann2.description}', using '{ann1.description}'")
      description = ann1.description
    else:
      if debug:
        logger.info(
          f"Box containment detected: '{ann2.description}' contains '{ann1.description}', using '{ann2.description}'")
      description = ann2.description
  elif iou > 0.5:  # Boxes cover mostly the same area but neither fully contains the other
    description = (ann1.description if len(ann1.description) >= len(ann2.description)
                   else ann2.description)
  else:
    # Determine left-to-right order based on centers
    if ann1.bounding_poly.center.x <= ann2.bounding_poly.center.x:
      description = f"{ann1.description} {ann2.description}"
    else:
      description = f"{ann2.description} {ann1.description}"

  if debug:
    logger.info(f"Merging boxes with IoU: {iou:.3f}")
    logger.info(f"Box 1: '{ann1.description}', Area: {box1_area:.2f}")
    logger.info(f"Box 2: '{ann2.description}', Area: {box2_area:.2f}")
    logger.info(
      f"Containment ratios: Box 1 in 2: {containment_ratio_1_in_2:.3f}, Box 2 in 1: {containment_ratio_2_in_1:.3f}")
    logger.info(f"Resulting description: '{description}'")

  # Use the angle of the larger box for the merged box
  merged_angle = ann1.bounding_poly.angle if box1_area >= box2_area else ann2.bounding_poly.angle

  # Collect all vertices from both boxes
  all_vertices = ann1.bounding_poly.vertices + ann2.bounding_poly.vertices

  # Create a merged box using a rotated coordinate system
  cos_angle = math.cos(-merged_angle)  # Negative angle to rotate back to axis-aligned
  sin_angle = math.sin(-merged_angle)

  # Rotate all points to an axis-aligned coordinate system
  rotated_points = []
  for point in all_vertices:
    # Translate to origin
    x_centered = point.x - ann1.bounding_poly.center.x
    y_centered = point.y - ann1.bounding_poly.center.y

    # Rotate
    x_rotated = x_centered * cos_angle - y_centered * sin_angle
    y_rotated = x_centered * sin_angle + y_centered * cos_angle

    # Translate back (temporary, we'll use min/max in rotated space)
    rotated_points.append((x_rotated, y_rotated))

  # Find min/max in rotated space
  x_min_rot = min(p[0] for p in rotated_points)
  x_max_rot = max(p[0] for p in rotated_points)
  y_min_rot = min(p[1] for p in rotated_points)
  y_max_rot = max(p[1] for p in rotated_points)

  # Create the corners of the bounding box in rotated space
  corners_rot = [
    (x_min_rot, y_min_rot),  # Top-left
    (x_max_rot, y_min_rot),  # Top-right
    (x_max_rot, y_max_rot),  # Bottom-right
    (x_min_rot, y_max_rot),  # Bottom-left
  ]

  # Rotate back to original orientation
  merged_center = ann1.bounding_poly.center  # Use center of first box as reference
  merged_vertices = []
  for x_rot, y_rot in corners_rot:
    # Rotate
    x_orig = x_rot * cos_angle + y_rot * sin_angle
    y_orig = -x_rot * sin_angle + y_rot * cos_angle

    # Translate from origin
    x = x_orig + merged_center.x
    y = y_orig + merged_center.y

    merged_vertices.append(Point(x=x, y=y))

  return TextAnnotation(
    description=description,
    bounding_poly=BoundingBox(vertices=merged_vertices)
  )


def create_debug_image(width: int = 1000, height: int = 1000,
                       background_color: Tuple[int, int, int] = (255, 255, 255),
                       image_url: Optional[str] = None) -> Image.Image:
  """
  Create an image for visualization.

  Args:
      width: Width of the blank image if no URL is provided
      height: Height of the blank image if no URL is provided
      background_color: Background color of the blank image
      image_url: URL of the image to load

  Returns:
      PIL Image object
  """
  if image_url:
    try:
      # Load image from URL with its original size
      with urllib.request.urlopen(image_url) as url:
        img_data = url.read()
      image = Image.open(io.BytesIO(img_data))

      # Use the image as is, without resizing
      return image
    except Exception as e:
      logger.warning(f"Error loading image from URL: {e}")
      # Fall back to blank image if loading fails
      return Image.new('RGB', (width, height), background_color)
  else:
    # Create blank image
    return Image.new('RGB', (width, height), background_color)


def draw_bounding_box(draw: ImageDraw.ImageDraw, box: BoundingBox, color: Tuple[int, int, int], width: int = 2) -> None:
  """
  Draw a bounding box on the image.

  Args:
      draw: PIL ImageDraw object
      box: BoundingBox to draw
      color: RGB color tuple
      width: Line width
  """
  points = [(p.x, p.y) for p in box.vertices]
  # Close the polygon by connecting the last point to the first
  points.append(points[0])
  draw.line(points, fill=color, width=width)


def visualize_merge(all_annotations: List[TextAnnotation],
                    ann1: TextAnnotation,
                    ann2: TextAnnotation,
                    merged_annotation: TextAnnotation,
                    image_url: Optional[str] = None,
                    image_size: Tuple[int, int] = (1000, 1000)) -> Image.Image:
  """
  Visualize a merge operation for debugging.

  Args:
      all_annotations: All current text annotations
      ann1: The first annotation being merged
      ann2: The second annotation being merged
      merged_annotation: The result of merging ann1 and ann2
      image_url: URL of the image to overlay boxes on
      image_size: Size of the visualization image if no URL is provided

  Returns:
      PIL Image with the visualization
  """
  # Create an image (either blank or from URL with original dimensions)
  image = create_debug_image(width=image_size[0], height=image_size[1], image_url=image_url)
  draw = ImageDraw.Draw(image)

  # Draw all current boxes in red
  for ann in all_annotations:
    if ann != ann1 and ann != ann2:  # Skip the two being merged
      draw_bounding_box(draw, ann.bounding_poly, color=(255, 0, 0))

  # Draw the two boxes to be merged in blue
  draw_bounding_box(draw, ann1.bounding_poly, color=(0, 0, 255), width=3)
  draw_bounding_box(draw, ann2.bounding_poly, color=(0, 0, 255), width=3)

  # Draw the merged box in yellow
  draw_bounding_box(draw, merged_annotation.bounding_poly, color=(255, 255, 0), width=4)

  # Add text labels - make text more visible with a semi-transparent background
  font = None  # Use default font
  text = f"Merging: '{ann1.description}' + '{ann2.description}' → '{merged_annotation.description}'"

  # Calculate text size
  text_width, text_height = draw.textbbox((0, 0), text, font=font)[2:4]

  # Draw semi-transparent background for text
  draw.rectangle([(10, 10), (20 + text_width, 20 + text_height)],
                 fill=(255, 255, 255, 180))

  # Draw text
  draw.text((15, 15), text, fill=(0, 0, 0), font=font)

  return image


def merge_boxes_with_criteria(annotations: List[TextAnnotation],
                              merge_criteria: callable,
                              debug: bool = False,
                              image_url: Optional[str] = None) -> List[TextAnnotation]:
  """
  Merge boxes based on the provided criteria function.

  Args:
      annotations: List of TextAnnotation objects
      merge_criteria: Function that takes two BoundingBox objects and returns True if they should be merged
      debug: Whether to print debug information and visualize merges
      image_url: URL of the image for visualization (used only if debug=True)

  Returns:
      List of merged TextAnnotation objects
  """
  while True:
    merged = False
    for i in range(len(annotations)):
      for j in range(i + 1, len(annotations)):
        if merge_criteria(annotations[i].bounding_poly, annotations[j].bounding_poly):
          merged_annotation = merge_boxes(annotations[i], annotations[j], debug=debug)

          if debug:
            logger.info(f"Merging boxes: {annotations[i].description} and {annotations[j].description}")
            # Visualize the merge if in debug mode and display is available
            try:
              img = visualize_merge(annotations, annotations[i], annotations[j],
                                    merged_annotation, image_url=image_url)

              from IPython.display import display
              display(img)
            except Exception as e:
              logger.warning(f"Could not visualize merge: {e}")

          # Remove the two annotations and add the merged one
          annotations = annotations[:i] + annotations[i + 1:j] + annotations[j + 1:] + [merged_annotation]
          merged = True
          break
      if merged:
        break
    if not merged:
      break

  return annotations


def convert_raw_annotations_to_text_annotations(raw_annotations: List[Any]) -> List[TextAnnotation]:
  """
  Convert raw annotations from an API to TextAnnotation objects.

  Args:
      raw_annotations: List of raw annotation objects (e.g., from Google Cloud Vision API)

  Returns:
      List of TextAnnotation objects
  """
  annotations = []

  # Skip the first annotation if it's a full image annotation
  for annotation in raw_annotations[1:]:
    vertices = annotation.bounding_poly.vertices
    # Handle case where x or y might be missing in the API response
    points = []
    for vertex in vertices:
      x = vertex.x if hasattr(vertex, 'x') else 0
      y = vertex.y if hasattr(vertex, 'y') else 0
      points.append(Point(x=x, y=y))

    if len(points) == 4:  # Ensure we have exactly 4 points
      annotations.append(TextAnnotation(
        description=annotation.description,
        bounding_poly=BoundingBox(vertices=points)
      ))

  return annotations


def clean_text_annotations(text_annotations: List[Any],
                           image_url: Optional[str] = None,
                           debug: bool = False) -> List[TextAnnotation]:
  """
  Main function to clean and merge text annotations from an image.

  This function performs two passes:
  1. Merge overlapping boxes
  2. Merge vertically aligned and horizontally adjacent boxes

  Args:
      text_annotations: List of annotation objects from OCR API
      image_url: URL of the image for visualization (used only if debug=True)
      debug: Whether to print debug information and visualize merges

  Returns:
      List of merged TextAnnotation objects
  """
  if debug:
    logging.basicConfig(level=logging.INFO)
    logger.info("Starting text annotation cleaning process")

  # Convert raw annotations to TextAnnotation objects
  annotations = convert_raw_annotations_to_text_annotations(text_annotations)

  if debug:
    logger.info(f"Converted {len(annotations)} raw annotations to TextAnnotation objects")

  # First pass: merge overlapping boxes
  if debug:
    logger.info("Pass 1: Merging overlapping boxes")

  annotations = merge_boxes_with_criteria(
    annotations,
    boxes_overlap,
    debug=debug,
    image_url=image_url
  )

  # Second pass: merge vertically aligned and horizontally adjacent boxes
  if debug:
    logger.info("Pass 2: Merging vertically aligned and horizontally adjacent boxes")

  annotations = merge_boxes_with_criteria(
    annotations,
    boxes_vertically_aligned,
    debug=debug,
    image_url=image_url
  )

  if debug:
    logger.info(f"Finished cleaning. Reduced to {len(annotations)} text annotations")

  return annotations
