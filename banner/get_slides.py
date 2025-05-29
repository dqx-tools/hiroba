import httpx
import re
from typing import List
from bs4 import BeautifulSoup, Tag
from dataclasses import dataclass

@dataclass
class Slide:
  alt: str
  src: str
  href: str

HREF_REGEX = re.compile(r"javascript:ctrLinkAction\('link=([^']+)'\);")
URL = 'https://hiroba.dqx.jp/sc/rotationbanner'
HEADERS = {
  'Accept': 'text/html',
  'User-Agent': 'Barohi/1.0'
}

def extract_slide(slide: Tag) -> Slide:
  link = slide.select_one('a')
  image = slide.select_one('img')

  href_match = HREF_REGEX.search(link['href']) if link and link.has_attr('href') else None
  href = href_match.group(1) if href_match else None
  src = image['src'] if image and image.has_attr('src') else None
  alt = image['alt'] if image and image.has_attr('alt') else None

  return Slide(href, src, alt)

async def get_slides() -> List[Slide]:
  async with httpx.AsyncClient() as client:
    response = await client.get(URL, headers=HEADERS)
    banner_html = response.text

  # Parse HTML using BeautifulSoup
  document = BeautifulSoup(banner_html, 'html.parser')

  # Find slides
  slides = document.select('#topBanner .slide')

  return [extract_slide(slide) for slide in slides]

