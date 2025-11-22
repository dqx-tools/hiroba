"""Tests for DQX translator."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.dqx_news.translator import (
    DQXTranslator,
    TranslatedNewsItem,
    TranslatedNewsDetail,
)
from src.dqx_news.scraper import NewsItem, NewsDetail, NewsCategory


class TestDQXTranslator:
    """Tests for DQXTranslator."""

    @pytest.fixture
    def mock_llm_response(self):
        """Create a mock LLM response."""
        response = MagicMock()
        response.content = "Translated text"
        return response

    @pytest.fixture
    def translator(self):
        """Create translator with mocked LLM."""
        with patch("src.dqx_news.translator.ChatOpenAI") as mock_chat:
            mock_instance = MagicMock()
            mock_chat.return_value = mock_instance
            return DQXTranslator(openai_api_key="test-key")

    def test_compute_content_hash(self):
        """Test content hash computation."""
        hash1 = DQXTranslator.compute_content_hash("test content")
        hash2 = DQXTranslator.compute_content_hash("test content")
        hash3 = DQXTranslator.compute_content_hash("different content")

        assert hash1 == hash2
        assert hash1 != hash3
        assert len(hash1) == 16

    @pytest.mark.asyncio
    async def test_translate_title(self, translator, mock_llm_response):
        """Test title translation."""
        translator.title_chain = AsyncMock()
        translator.title_chain.ainvoke = AsyncMock(return_value=mock_llm_response)

        result = await translator.translate_title("テストタイトル")

        assert result == "Translated text"
        translator.title_chain.ainvoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_translate_empty_title(self, translator):
        """Test empty title returns empty string."""
        result = await translator.translate_title("")
        assert result == ""

        result = await translator.translate_title("   ")
        assert result == ""

    @pytest.mark.asyncio
    async def test_translate_content(self, translator, mock_llm_response):
        """Test content translation."""
        translator.content_chain = AsyncMock()
        translator.content_chain.ainvoke = AsyncMock(return_value=mock_llm_response)

        result = await translator.translate_content("テスト本文")

        assert result == "Translated text"
        translator.content_chain.ainvoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_translate_news_item(self, translator, mock_llm_response):
        """Test full news item translation."""
        translator.title_chain = AsyncMock()
        translator.title_chain.ainvoke = AsyncMock(return_value=mock_llm_response)

        item = NewsItem(
            id="test123",
            title="テストニュース",
            date="2025-01-15",
            url="https://example.com",
            category=NewsCategory.NEWS,
        )

        result = await translator.translate_news_item(item)

        assert isinstance(result, TranslatedNewsItem)
        assert result.id == "test123"
        assert result.title_ja == "テストニュース"
        assert result.title_en == "Translated text"
        assert result.category == "News"
        assert result.category_ja == "ニュース"

    @pytest.mark.asyncio
    async def test_translate_news_detail(self, translator, mock_llm_response):
        """Test full news detail translation."""
        translator.title_chain = AsyncMock()
        translator.title_chain.ainvoke = AsyncMock(return_value=mock_llm_response)
        translator.content_chain = AsyncMock()
        content_response = MagicMock()
        content_response.content = "Translated content"
        translator.content_chain.ainvoke = AsyncMock(return_value=content_response)

        detail = NewsDetail(
            id="test123",
            title="テストタイトル",
            date="2025-01-15",
            category=NewsCategory.EVENTS,
            content_html="<p>本文</p>",
            content_text="本文",
            url="https://example.com",
        )

        result = await translator.translate_news_detail(detail)

        assert isinstance(result, TranslatedNewsDetail)
        assert result.id == "test123"
        assert result.title_en == "Translated text"
        assert result.content_en == "Translated content"
        assert result.content_hash is not None

    @pytest.mark.asyncio
    async def test_translate_news_detail_with_cache(self, translator, mock_llm_response):
        """Test news detail translation uses cached content."""
        translator.title_chain = AsyncMock()
        translator.title_chain.ainvoke = AsyncMock(return_value=mock_llm_response)
        translator.content_chain = AsyncMock()

        detail = NewsDetail(
            id="test123",
            title="テストタイトル",
            date="2025-01-15",
            category=NewsCategory.EVENTS,
            content_html="<p>本文</p>",
            content_text="本文",
            url="https://example.com",
        )

        result = await translator.translate_news_detail(
            detail, cached_translation="Previously translated content"
        )

        assert result.content_en == "Previously translated content"
        # Content chain should not be called when using cache
        translator.content_chain.ainvoke.assert_not_called()


class TestTranslatedNewsItem:
    """Tests for TranslatedNewsItem dataclass."""

    def test_creation(self):
        item = TranslatedNewsItem(
            id="test123",
            title_ja="日本語タイトル",
            title_en="English Title",
            date="2025-01-15",
            url="https://example.com",
            category="News",
            category_ja="ニュース",
        )

        assert item.id == "test123"
        assert item.title_ja == "日本語タイトル"
        assert item.title_en == "English Title"


class TestTranslatedNewsDetail:
    """Tests for TranslatedNewsDetail dataclass."""

    def test_creation(self):
        detail = TranslatedNewsDetail(
            id="test123",
            title_ja="日本語タイトル",
            title_en="English Title",
            date="2025-01-15",
            url="https://example.com",
            category="Events",
            category_ja="イベント",
            content_ja="日本語本文",
            content_en="English content",
            content_hash="abc123",
        )

        assert detail.id == "test123"
        assert detail.content_ja == "日本語本文"
        assert detail.content_en == "English content"
