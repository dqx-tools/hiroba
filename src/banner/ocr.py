"""Google Cloud Vision OCR integration."""

from google.cloud import vision

from .models import BoundingBox, Point, TextAnnotation


def detect_text(image_url: str) -> list[TextAnnotation]:
    """
    Detect text in an image using Google Cloud Vision API.

    Args:
        image_url: URL of the image to analyze

    Returns:
        List of TextAnnotation objects with detected text and bounding boxes
    """
    client = vision.ImageAnnotatorClient()

    image = vision.Image()
    image.source.image_uri = image_url

    response = client.text_detection(  # type: ignore[attr-defined]
        image=image, image_context={"language_hints": ["ja"]}
    )

    return _convert_annotations(response.text_annotations)


def _convert_annotations(raw_annotations: list) -> list[TextAnnotation]:
    """Convert Google Vision API annotations to our TextAnnotation model."""
    annotations = []

    # Skip the first annotation (full image text)
    for annotation in raw_annotations[1:]:
        vertices = annotation.bounding_poly.vertices
        points = []

        for vertex in vertices:
            x = vertex.x if hasattr(vertex, "x") else 0
            y = vertex.y if hasattr(vertex, "y") else 0
            points.append(Point(x=x, y=y))

        if len(points) == 4:
            annotations.append(
                TextAnnotation(
                    description=annotation.description,
                    bounding_poly=BoundingBox(vertices=points),
                )
            )

    return annotations
