from get_font_analogue import get_font_analogue
from get_text_style import get_text_style
from clean_bounding_boxes import clean_text_annotations
from inpaint import inpaint_bounding_boxes
from google_ocr import detect_text_for
from get_font import get_font
from PIL import Image
from extract_poly_from_image import extract_box
from get_text_style import image_to_data_uri
from translate_text_with_context import translate_image_texts
from get_slides import get_slides
import io
import httpx
import asyncio
import math
import os

async def load_image(image_url: str) -> Image:
  async with httpx.AsyncClient() as client:
    response = await client.get(image_url)

  # Check response status
  response.raise_for_status()

  return Image.open(io.BytesIO(response.content))

async def translate_image(image_url: str) -> Image:
  image = await load_image(image_url)
  text_annotations = detect_text_for(image_url)
  cleaned_annotations = clean_text_annotations(text_annotations)
  inpainted_image = inpaint_bounding_boxes(image_url, cleaned_annotations)
  translated_texts = translate_image_texts(image, [annotation.description for annotation in cleaned_annotations])

  svg = f'<svg width="{image.width}" height="{image.height}" xmlns="http://www.w3.org/2000/svg">'
  svg += f'<image href="{image_to_data_uri(inpainted_image)}" width="{image.width}" height="{image.height}" />'
  for annotation in cleaned_annotations:
    box_image = extract_box(image, annotation.bounding_poly)
    text_style = get_text_style(box_image)
    #font_analogue = get_font_analogue(await get_font(box_image))
    font_analogue = 'Open Sans'

    if annotation.description in translated_texts:
      text = translated_texts[annotation.description]
    else:
      text = annotation.description

    svg += (f'<text x="{annotation.bounding_poly.center.x}" y="{annotation.bounding_poly.center.y}" '
            f'fill="{text_style.foreground_color}" stroke="{text_style.border_color}" stroke-width="2" '
            f'font-weight="{text_style.font_weight}" font-family="{font_analogue}" dominant-baseline="middle" '
            f'font-size="{text_style.font_size}" text-anchor="middle" paint-order="stroke fill" '
            f'textLength="{annotation.bounding_poly.dimensions[0]}" lengthAdjust="spacingAndGlyphs" '
            f'transform="rotate({math.degrees(annotation.bounding_poly.angle)})" transform-origin="center">'
            f'{text}</text>')
  svg += '</svg>'

  return svg

async def main():
  slides = await get_slides()
  for slide in slides:
    out = os.path.basename(slide.src).replace('jpg', 'svg')
    with open(out, 'w') as f:
      f.write(await translate_image(slide.src))
    print(out)

asyncio.run(main())