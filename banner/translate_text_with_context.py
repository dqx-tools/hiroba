from openai import OpenAI
import base64
from io import BytesIO
from PIL import Image
from json import loads
from typing import List, Dict
import textdistance
import unicodedata
import sys

PROMPT = """
Translate this image from Japanese to English. Please return values for the following pieces of text extracted from the
image (which may not be accurate to what you read, it's from a legacy OCR system and has lower accuracy than you do).
Return the result in the form of a JSON object where the keys are these original strings and the values are your
translated output. Return only JSON, do not include any other information. Do not wrap it in markdown. For context,
the image is an event banner image for Dragon Quest X, a popular MMORPG in Japan.
"""

client = OpenAI()

def response_format_for(texts: List[str]) -> Dict:
  return {
    "type": "json_schema",
    "json_schema": {
      "name": "text_translation",
      "schema": {
        "type": "object",
        "properties": { prop: { "type": "string" } for prop in texts },
        "additionalProperties": False,
        "required": [prop for prop in texts]
      }
    }
  }

def image_to_data_uri(image: Image) -> str:
  buffer = BytesIO()
  image.save(buffer, format="PNG")
  img_str = base64.b64encode(buffer.getvalue())
  return f"data:image/png;base64,{img_str.decode('utf-8')}"

def fuzzy_dict_lookup(dictionary: Dict[str, str], key: str) -> str:
  best_match: tuple[float, str] = (0.0, '')
  for dict_key in dictionary:
    match = textdistance.cosine.normalized_similarity(key, dict_key)
    if match > best_match[0]:
      best_match = (match, dictionary[dict_key])
  return best_match[1]

def translate_image_texts(image: Image, texts: List[str]) -> Dict[str, str]:
  texts = [unicodedata.normalize('NFC', text) for text in texts]
  image_data_uri = image_to_data_uri(image)

  response_format = response_format_for(texts)

  completion = client.chat.completions.create(
    model="gpt-4o",
    #response_format=response_format,
    response_format={ "type": "json_object" },
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
        }, {
          "type": "text",
          "role": "user",
          "text": "\n".join(texts),
        }]
      }
    ]
  )
  translations = loads(completion.choices[0].message.content)
  translations = {
    key: fuzzy_dict_lookup(translations, unicodedata.normalize('NFC', key)) for key in texts
  }

  return translations
