from google.cloud import vision
from typing import List

def detect_text_for(image_url: str) -> List[vision.TextAnnotation]:
  client = vision.ImageAnnotatorClient()

  image = vision.Image()
  image.source.image_uri = image_url

  response = client.text_detection(image=image, image_context={
    "language_hints": "ja"
  })

  return response.text_annotations
