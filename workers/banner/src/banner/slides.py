"""Fetch rotation banner slides from DQX hiroba."""

import re

import httpx
from bs4 import BeautifulSoup, Tag

from .models import Slide

BANNER_URL = "https://hiroba.dqx.jp/sc/rotationbanner"
HREF_REGEX = re.compile(r"javascript:ctrLinkAction\('link=([^']+)'\);")
DEFAULT_HEADERS = {
    "Accept": "text/html",
    "User-Agent": "Barohi/1.0",
}


def _extract_slide(slide: Tag) -> Slide:
    """Extract slide data from HTML element."""
    link = slide.select_one("a")
    image = slide.select_one("img")

    href_match = (
        HREF_REGEX.search(link["href"]) if link and link.has_attr("href") else None
    )
    href = href_match.group(1) if href_match else None
    src = image["src"] if image and image.has_attr("src") else None
    alt = image["alt"] if image and image.has_attr("alt") else None

    return Slide(alt=alt, src=src, href=href)


async def get_banner_slides(
    client: httpx.AsyncClient | None = None,
) -> list[Slide]:
    """
    Fetch rotation banner slides from DQX hiroba.

    Args:
        client: Optional httpx client to use for the request

    Returns:
        List of Slide objects with banner information
    """
    if client is None:
        async with httpx.AsyncClient() as client:
            return await _fetch_slides(client)
    else:
        return await _fetch_slides(client)


async def _fetch_slides(client: httpx.AsyncClient) -> list[Slide]:
    """Internal function to fetch and parse slides."""
    response = await client.get(BANNER_URL, headers=DEFAULT_HEADERS)
    response.raise_for_status()

    document = BeautifulSoup(response.text, "html.parser")
    slides = document.select("#topBanner .slide")

    return [_extract_slide(slide) for slide in slides]
