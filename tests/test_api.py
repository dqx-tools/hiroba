"""Tests for DQX News API."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from src.dqx_news.api import create_app, _get_japanese_category
from src.dqx_news.cache import CachedTranslation


class MockD1Result:
    """Mock D1 query result."""

    def __init__(self, results=None, changes=0):
        self.results = results or []
        self.changes = changes


class MockD1Database:
    """Mock D1 database for testing."""

    def __init__(self):
        self.execute = AsyncMock(return_value=MockD1Result())
        self.batch = AsyncMock()


@pytest.fixture
def mock_db():
    return MockD1Database()


@pytest.fixture
def app(mock_db):
    with patch("src.dqx_news.api.DQXTranslator") as mock_translator:
        mock_translator_instance = MagicMock()
        mock_translator.return_value = mock_translator_instance
        return create_app(mock_db, "test-api-key")


@pytest.fixture
def client(app):
    return TestClient(app)


class TestAPIEndpoints:
    """Tests for API endpoints."""

    def test_root_endpoint(self, client):
        """Test root endpoint returns service info."""
        response = client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "DQX News API"
        assert "endpoints" in data

    def test_categories_endpoint(self, client):
        """Test categories endpoint."""
        response = client.get("/categories")

        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        assert len(data["categories"]) == 4

        category_names = [c["name"] for c in data["categories"]]
        assert "News" in category_names
        assert "Events" in category_names
        assert "Updates" in category_names
        assert "Maintenance" in category_names

    def test_health_endpoint(self, client):
        """Test health check endpoint."""
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_news_list_empty(self, client, mock_db):
        """Test news list with empty cache."""
        mock_db.execute.return_value = MockD1Result(results=[])

        response = client.get("/news")

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_news_list_with_items(self, client, mock_db):
        """Test news list with cached items."""
        cached_items = [
            {
                "news_id": "test123",
                "content_hash": "hash123",
                "title_ja": "日本語タイトル",
                "title_en": "English Title",
                "content_ja": None,
                "content_en": None,
                "category": "News",
                "date": "2025-01-15",
                "url": "https://example.com/test123",
                "created_at": "2025-01-15T10:00:00Z",
                "updated_at": "2025-01-15T10:00:00Z",
            }
        ]

        # First call for listings, second for count
        mock_db.execute.side_effect = [
            MockD1Result(results=cached_items),
            MockD1Result(results=[{"count": 1}]),
        ]

        response = client.get("/news")

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == "test123"
        assert data["items"][0]["title_en"] == "English Title"

    def test_news_list_pagination(self, client, mock_db):
        """Test news list pagination."""
        mock_db.execute.side_effect = [
            MockD1Result(results=[]),
            MockD1Result(results=[{"count": 100}]),
        ]

        response = client.get("/news?page=2&page_size=20")

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2
        assert data["page_size"] == 20

    def test_news_list_category_filter(self, client, mock_db):
        """Test news list with category filter."""
        mock_db.execute.side_effect = [
            MockD1Result(results=[]),
            MockD1Result(results=[{"count": 0}]),
        ]

        response = client.get("/news?category=events")

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_news_detail_cached(self, client, mock_db):
        """Test news detail returns cached content."""
        cached_item = {
            "news_id": "test123",
            "content_hash": "hash123",
            "title_ja": "日本語タイトル",
            "title_en": "English Title",
            "content_ja": "日本語本文",
            "content_en": "English content",
            "category": "News",
            "date": "2025-01-15",
            "url": "https://example.com/test123",
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:00:00Z",
        }

        mock_db.execute.return_value = MockD1Result(results=[cached_item])

        response = client.get("/news/test123")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "test123"
        assert data["title_en"] == "English Title"
        assert data["content_en"] == "English content"
        assert data["cached"] is True


class TestHelperFunctions:
    """Tests for helper functions."""

    def test_get_japanese_category(self):
        """Test Japanese category name lookup."""
        assert _get_japanese_category("News") == "ニュース"
        assert _get_japanese_category("Events") == "イベント"
        assert _get_japanese_category("Updates") == "アップデート"
        assert _get_japanese_category("Maintenance") == "メンテナンス/障害"
        assert _get_japanese_category("Unknown") == "Unknown"


class TestAPIModels:
    """Tests for API response models."""

    def test_news_list_response_structure(self, client, mock_db):
        """Test news list response has correct structure."""
        mock_db.execute.side_effect = [
            MockD1Result(results=[]),
            MockD1Result(results=[{"count": 0}]),
        ]

        response = client.get("/news")
        data = response.json()

        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "has_more" in data

    def test_news_detail_response_structure(self, client, mock_db):
        """Test news detail response has correct structure."""
        cached_item = {
            "news_id": "test123",
            "content_hash": "hash123",
            "title_ja": "日本語",
            "title_en": "English",
            "content_ja": "本文",
            "content_en": "Content",
            "category": "News",
            "date": "2025-01-15",
            "url": "https://example.com",
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:00:00Z",
        }

        mock_db.execute.return_value = MockD1Result(results=[cached_item])

        response = client.get("/news/test123")
        data = response.json()

        assert "id" in data
        assert "title_ja" in data
        assert "title_en" in data
        assert "date" in data
        assert "url" in data
        assert "category" in data
        assert "category_ja" in data
        assert "content_ja" in data
        assert "content_en" in data
        assert "cached" in data
