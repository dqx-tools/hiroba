from openai import OpenAI
import base64
from io import BytesIO
from PIL import Image
from json import loads
from dataclasses import dataclass
import numpy as np
from collections import Counter
from sklearn.cluster import KMeans
from typing import List, Tuple

PROMPT = """
Describe the text styling in this image. Respond in the form of a JSON object with keys for the text
foreground color, the text border/drop shadow color, and approximate font weight. Provide the colors
as hex codes, and font weight as a number from 100-900. Respond only with JSON. Do not analyze, do
it yourself.
"""
RESPONSE_FORMAT={
  "type": "json_schema",
  "json_schema": {
    "name": "text_style",
    "schema": {
      "type": "object",
      "properties": {
        "foreground_color": {
          "type": "string",
          "description": "The foreground color of the text",
          "pattern": "/#[A-F0-9]+/"
        },
        "border_color": {
          "type": "string",
          "description": "The text border or drop shadow color.",
          "pattern": "/#[A-F0-9]+/"
        },
        "font_size": {
          "type": "number",
          "description": "The font size of the text",
          "minimum": 0
        },
        "font_weight": {
          "type": "integer",
          "description": "The approximate font weight of the text",
          "minimum": 100,
          "maximum": 900,
          "multipleOf": 100
        },
      },
      "required": [
        "foreground_color",
        "border_color",
        "font_size",
        "font_weight"
      ]
    }
  }
}

client = OpenAI()

@dataclass
class TextStyle:
  foreground_color: str
  border_color: str
  font_weight: int
  font_size: int

RGB = Tuple[int, int, int]

def closest_color(colors: List[RGB], color: RGB) -> RGB:
  colors = np.array(colors)
  color = np.array(color)
  distances = np.sqrt(np.sum((colors - color) ** 2, axis=1))
  index_of_smallest = np.where(distances == np.amin(distances))
  smallest_distance = colors[index_of_smallest]
  return tuple(smallest_distance[0])

def image_to_data_uri(image: Image) -> str:
  buffer = BytesIO()
  image.save(buffer, format="PNG")
  img_str = base64.b64encode(buffer.getvalue())
  return f"data:image/png;base64,{img_str.decode('utf-8')}"

def get_text_style_from_openai(image: Image) -> TextStyle:
  image_data_uri = image_to_data_uri(image)

  completion = client.chat.completions.create(
    model="gpt-4o",
    response_format=RESPONSE_FORMAT,
    messages=[
      {
        "role": "system",
        "content": PROMPT,
      },
      {
        "role": "user",
        "content": [{
          "type": "image_url",
          "image_url": {
            "url": image_data_uri,
          },
        }]
      }
    ]
  )
  text_style = loads(completion.choices[0].message.content)
  return TextStyle(text_style['foreground_color'], text_style['border_color'], text_style['font_weight'], 0)

def get_dominant_colors(image: Image, num_colors: int = 5) -> List[RGB]:
  # Convert image to RGB mode if it's not
  img = image.convert('RGB')

  # Convert the image into a numpy array and reshape it
  img_array = np.array(img)
  pixels = img_array.reshape(-1, 3)

  # Perform K-means clustering
  kmeans = KMeans(n_clusters=num_colors, n_init=10)
  kmeans.fit(pixels)

  # Get the colors and counts
  colors = kmeans.cluster_centers_.astype(int)
  labels = kmeans.labels_
  counts = Counter(labels)
  total_pixels = sum(counts.values())

  # Calculate percentages and create results
  color_percentages = [(tuple([rgb.item() for rgb in color]), count / total_pixels * 100)
                       for color, count in zip(colors, [counts[i] for i in range(num_colors)])]

  # Sort by percentage (highest first)
  color_percentages.sort(key=lambda x: x[1], reverse=True)

  colors = [tuple(color[0]) for color in color_percentages]

  return colors

def rgb2hex(rgb: RGB) -> str:
    return "#{:02x}{:02x}{:02x}".format(rgb[0], rgb[1], rgb[2])

def hex2rgb(hexcode: str) -> RGB:
    return tuple(bytes.fromhex(hexcode[1:]))

def get_text_style(image: Image) -> TextStyle:
  colors = get_dominant_colors(image, num_colors=5)
  text_style = get_text_style_from_openai(image)

  # Find the closest color to the foreground color
  foreground_color = closest_color(colors, hex2rgb(text_style.foreground_color))
  foreground_color = rgb2hex(foreground_color)

  # Find the closest color to the border color
  border_color = closest_color(colors, hex2rgb(text_style.border_color))
  border_color = rgb2hex(border_color)

  return TextStyle(foreground_color, border_color, text_style.font_weight, image.height * 0.8)
