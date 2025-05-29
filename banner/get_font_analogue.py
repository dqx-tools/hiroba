from openai import OpenAI
import base64
from io import BytesIO
from PIL import Image
from typing import Union

EXPLICIT_FONT_MAPPINGS = {
  "ライラ": "Laila",
  "Kurokane": "Black Han Sans",
  "Seurat": "Nunito",
  "GMaruGo": "Nunito",
  "TelopMin": "Sorts Mill Goudy",
  "LapisEdge": "Roboto",
  "NewCezanne": "Roboto",
}

PROMPT = """
Please find a similar font with support for the Latin alphabet, available on Google Fonts. Try to
match style as best as you can, don't just cop out and say "Open Sans". It may help to think about
this font's unique attributes, style, and whatnot. Remember that the font doesn't need to be
Latin-first, just have support for Latin. Respond with nothing but the font name, and don't include
any other information or quotes.
"""

client = OpenAI()

def image_to_data_uri(image: Image) -> str:
  buffer = BytesIO()
  image.save(buffer, format="PNG")
  img_str = base64.b64encode(buffer.getvalue())
  return f"data:image/png;base64,{img_str.decode('utf-8')}"

def get_font_analogue(font: Union[str, None]) -> str:
  if font is None:
    return "Open Sans"

  # Check if the font is in the explicit mappings
  for key in EXPLICIT_FONT_MAPPINGS:
    if font in key:
      return EXPLICIT_FONT_MAPPINGS[key]

  completion = client.chat.completions.create(
    model="o1-mini",
    messages=[
      {
        "role": "user",
        "content": PROMPT,
      },
      {
        "role": "user",
        "content": font
      }
    ]
  )
  return completion.choices[0].message.content
