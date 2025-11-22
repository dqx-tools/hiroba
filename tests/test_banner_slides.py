"""Tests for slide fetching."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from src.banner.slides import _extract_slide, get_banner_slides
from src.banner.models import Slide


class TestExtractSlide:
    """Tests for _extract_slide function."""

    def test_extracts_slide_data(self):
        # Create mock HTML element
        from bs4 import BeautifulSoup

        html = """
        <div class="slide">
            <a href="javascript:ctrLinkAction('link=https://example.com/page');">
                <img src="https://example.com/image.jpg" alt="Test Banner">
            </a>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        slide_elem = soup.select_one(".slide")
        assert slide_elem is not None

        slide = _extract_slide(slide_elem)

        assert slide.src == "https://example.com/image.jpg"
        assert slide.alt == "Test Banner"
        assert slide.href == "https://example.com/page"

    def test_handles_missing_link(self):
        from bs4 import BeautifulSoup

        html = """
        <div class="slide">
            <img src="https://example.com/image.jpg" alt="Test">
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        slide_elem = soup.select_one(".slide")
        assert slide_elem is not None

        slide = _extract_slide(slide_elem)

        assert slide.src == "https://example.com/image.jpg"
        assert slide.href is None

    def test_handles_missing_image(self):
        from bs4 import BeautifulSoup

        html = """
        <div class="slide">
            <a href="javascript:ctrLinkAction('link=https://example.com');">Link</a>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        slide_elem = soup.select_one(".slide")
        assert slide_elem is not None

        slide = _extract_slide(slide_elem)

        assert slide.src is None
        assert slide.alt is None


class TestGetBannerSlides:
    """Tests for get_banner_slides function."""

    @pytest.mark.asyncio
    async def test_fetches_slides(self):
        # Create mock client
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.text = """
        <html>
        <body>
            <div id="topBanner">
                <div class="slide">
                    <a href="javascript:ctrLinkAction('link=https://example.com/1');">
                        <img src="https://example.com/img1.jpg" alt="Banner 1">
                    </a>
                </div>
                <div class="slide">
                    <a href="javascript:ctrLinkAction('link=https://example.com/2');">
                        <img src="https://example.com/img2.jpg" alt="Banner 2">
                    </a>
                </div>
            </div>
        </body>
        </html>
        """
        mock_response.raise_for_status = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        slides = await get_banner_slides(mock_client)

        assert len(slides) == 2
        assert slides[0].src == "https://example.com/img1.jpg"
        assert slides[1].src == "https://example.com/img2.jpg"

    @pytest.mark.asyncio
    async def test_empty_response(self):
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.text = "<html><body><div id='topBanner'></div></body></html>"
        mock_response.raise_for_status = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        slides = await get_banner_slides(mock_client)

        assert slides == []
