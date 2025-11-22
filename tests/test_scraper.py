"""Tests for DQX news scraper."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.dqx_news.scraper import (
    DQXNewsScraper,
    NewsCategory,
    NewsItem,
    NewsDetail,
)


class TestNewsCategory:
    """Tests for NewsCategory enum."""

    def test_category_values(self):
        assert NewsCategory.NEWS.value == 0
        assert NewsCategory.EVENTS.value == 1
        assert NewsCategory.UPDATES.value == 2
        assert NewsCategory.MAINTENANCE.value == 3

    def test_japanese_names(self):
        assert NewsCategory.NEWS.japanese_name == "ニュース"
        assert NewsCategory.EVENTS.japanese_name == "イベント"
        assert NewsCategory.UPDATES.japanese_name == "アップデート"
        assert NewsCategory.MAINTENANCE.japanese_name == "メンテナンス/障害"

    def test_english_names(self):
        assert NewsCategory.NEWS.english_name == "News"
        assert NewsCategory.EVENTS.english_name == "Events"
        assert NewsCategory.UPDATES.english_name == "Updates"
        assert NewsCategory.MAINTENANCE.english_name == "Maintenance"


class TestDQXNewsScraper:
    """Tests for DQXNewsScraper."""

    @pytest.fixture
    def sample_listing_html(self):
        return """
        <html>
        <body>
            <div class="news-list">
                <div class="news-item">
                    <a href="/sc/news/detail/abc123/">テストニュース1</a>
                    <span class="date">2025-01-15 10:00</span>
                </div>
                <div class="news-item">
                    <a href="/sc/news/detail/def456/">テストニュース2</a>
                    <span class="date">2025-01-14 15:30</span>
                </div>
            </div>
            <div class="pagination">
                <a href="/sc/news/category/0/1">1</a>
                <a href="/sc/news/category/0/2">2</a>
                <a href="/sc/news/category/0/3">3</a>
            </div>
        </body>
        </html>
        """

    @pytest.fixture
    def sample_detail_html(self):
        return """
        <html>
        <body>
            <h1>テストニュースタイトル</h1>
            <div class="date">2025-01-15 10:00</div>
            <div class="newsdetail">
                <p>これはテストニュースの本文です。</p>
                <p>詳細な情報がここに記載されています。</p>
            </div>
            <nav>
                <a href="/sc/news/category/0/" class="current">ニュース</a>
            </nav>
        </body>
        </html>
        """

    @pytest.mark.asyncio
    async def test_get_news_listing(self, sample_listing_html):
        """Test parsing news listing page."""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.text = sample_listing_html
        mock_response.raise_for_status = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        scraper = DQXNewsScraper(client=mock_client)

        async with scraper:
            items, total_pages = await scraper.get_news_listing(NewsCategory.NEWS)

        assert len(items) == 2
        assert items[0].id == "abc123"
        assert items[0].title == "テストニュース1"
        assert items[1].id == "def456"
        assert items[1].title == "テストニュース2"
        assert total_pages >= 3

    @pytest.mark.asyncio
    async def test_get_news_detail(self, sample_detail_html):
        """Test parsing news detail page."""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.text = sample_detail_html
        mock_response.raise_for_status = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        scraper = DQXNewsScraper(client=mock_client)

        async with scraper:
            detail = await scraper.get_news_detail("abc123")

        assert detail.id == "abc123"
        assert detail.title == "テストニュースタイトル"
        assert "2025-01-15" in detail.date
        assert "テストニュースの本文" in detail.content_text

    @pytest.mark.asyncio
    async def test_context_manager(self):
        """Test scraper context manager creates/closes client."""
        scraper = DQXNewsScraper()
        assert scraper._client is None

        async with scraper:
            assert scraper._client is not None
            assert scraper._owns_client is True

    def test_extract_date_pattern(self):
        """Test date extraction patterns."""
        from bs4 import BeautifulSoup

        html = '<div><a href="#">Title</a><span>2025-01-15 10:00</span></div>'
        soup = BeautifulSoup(html, "html.parser")
        link = soup.find("a")

        scraper = DQXNewsScraper()
        date = scraper._extract_date_near_element(link)

        assert "2025-01-15" in date


class TestNewsItem:
    """Tests for NewsItem dataclass."""

    def test_news_item_creation(self):
        item = NewsItem(
            id="test123",
            title="テストタイトル",
            date="2025-01-15",
            url="https://example.com/news/test123",
            category=NewsCategory.NEWS,
        )

        assert item.id == "test123"
        assert item.title == "テストタイトル"
        assert item.category == NewsCategory.NEWS


class TestNewsDetail:
    """Tests for NewsDetail dataclass."""

    def test_news_detail_creation(self):
        detail = NewsDetail(
            id="test123",
            title="テストタイトル",
            date="2025-01-15",
            category=NewsCategory.EVENTS,
            content_html="<p>コンテンツ</p>",
            content_text="コンテンツ",
            url="https://example.com/news/test123",
        )

        assert detail.id == "test123"
        assert detail.category == NewsCategory.EVENTS
        assert detail.content_text == "コンテンツ"
