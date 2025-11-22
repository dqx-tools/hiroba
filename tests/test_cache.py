"""Tests for D1 cache layer."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone

from src.dqx_news.cache import D1Cache, CachedTranslation


class MockD1Result:
    """Mock D1 query result."""

    def __init__(self, results=None, changes=0):
        self.results = results or []
        self.changes = changes


class MockD1Database:
    """Mock D1 database for testing."""

    def __init__(self):
        self.execute = AsyncMock()
        self.batch = AsyncMock()
        self._storage = {}

    def setup_empty_result(self):
        self.execute.return_value = MockD1Result(results=[])

    def setup_result(self, rows):
        self.execute.return_value = MockD1Result(results=rows)


class TestD1Cache:
    """Tests for D1Cache."""

    @pytest.fixture
    def mock_db(self):
        return MockD1Database()

    @pytest.fixture
    def cache(self, mock_db):
        return D1Cache(mock_db)

    @pytest.fixture
    def sample_cached_row(self):
        return {
            "news_id": "test123",
            "content_hash": "abc123def456",
            "title_ja": "日本語タイトル",
            "title_en": "English Title",
            "content_ja": "日本語本文",
            "content_en": "English content",
            "category": "News",
            "date": "2025-01-15",
            "url": "https://example.com/news/test123",
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:00:00Z",
        }

    @pytest.mark.asyncio
    async def test_initialize(self, cache, mock_db):
        """Test database initialization."""
        mock_db.execute.return_value = MockD1Result()

        await cache.initialize()

        # Should create table and indexes
        assert mock_db.execute.call_count >= 1

    @pytest.mark.asyncio
    async def test_get_translation_found(self, cache, mock_db, sample_cached_row):
        """Test getting existing translation."""
        mock_db.setup_result([sample_cached_row])

        result = await cache.get_translation("test123")

        assert result is not None
        assert isinstance(result, CachedTranslation)
        assert result.news_id == "test123"
        assert result.title_en == "English Title"

    @pytest.mark.asyncio
    async def test_get_translation_not_found(self, cache, mock_db):
        """Test getting non-existent translation."""
        mock_db.setup_empty_result()

        result = await cache.get_translation("nonexistent")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_translation_if_valid_matching_hash(
        self, cache, mock_db, sample_cached_row
    ):
        """Test getting translation when hash matches."""
        mock_db.setup_result([sample_cached_row])

        result = await cache.get_translation_if_valid("test123", "abc123def456")

        assert result is not None
        assert result.content_hash == "abc123def456"

    @pytest.mark.asyncio
    async def test_get_translation_if_valid_mismatched_hash(
        self, cache, mock_db, sample_cached_row
    ):
        """Test getting translation when hash doesn't match."""
        mock_db.setup_result([sample_cached_row])

        result = await cache.get_translation_if_valid("test123", "different_hash")

        assert result is None

    @pytest.mark.asyncio
    async def test_save_translation(self, cache, mock_db):
        """Test saving a new translation."""
        mock_db.execute.return_value = MockD1Result()

        await cache.save_translation(
            news_id="test123",
            content_hash="hash123",
            title_ja="日本語",
            title_en="English",
            category="News",
            date="2025-01-15",
            url="https://example.com",
            content_ja="本文",
            content_en="Content",
        )

        mock_db.execute.assert_called_once()
        call_args = mock_db.execute.call_args
        assert "INSERT INTO news_translations" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_get_listings_all(self, cache, mock_db, sample_cached_row):
        """Test getting all listings without filter."""
        mock_db.setup_result([sample_cached_row])

        result = await cache.get_listings()

        assert len(result) == 1
        assert result[0].news_id == "test123"

    @pytest.mark.asyncio
    async def test_get_listings_by_category(self, cache, mock_db, sample_cached_row):
        """Test getting listings filtered by category."""
        mock_db.setup_result([sample_cached_row])

        result = await cache.get_listings(category="News")

        mock_db.execute.assert_called_once()
        call_args = mock_db.execute.call_args
        assert "WHERE category = ?" in call_args[0][0]
        assert "News" in call_args[0][1]

    @pytest.mark.asyncio
    async def test_get_listings_pagination(self, cache, mock_db):
        """Test listings pagination."""
        mock_db.setup_empty_result()

        await cache.get_listings(limit=20, offset=40)

        call_args = mock_db.execute.call_args
        assert "LIMIT ? OFFSET ?" in call_args[0][0]
        assert 20 in call_args[0][1]
        assert 40 in call_args[0][1]

    @pytest.mark.asyncio
    async def test_get_count(self, cache, mock_db):
        """Test getting total count."""
        mock_db.execute.return_value = MockD1Result(results=[{"count": 42}])

        result = await cache.get_count()

        assert result == 42

    @pytest.mark.asyncio
    async def test_get_count_by_category(self, cache, mock_db):
        """Test getting count by category."""
        mock_db.execute.return_value = MockD1Result(results=[{"count": 10}])

        result = await cache.get_count(category="Events")

        assert result == 10
        call_args = mock_db.execute.call_args
        assert "WHERE category = ?" in call_args[0][0]

    def test_is_cache_stale_fresh(self, cache):
        """Test cache is not stale when recently updated."""
        now = datetime.now(timezone.utc).isoformat()
        cached = CachedTranslation(
            news_id="test123",
            content_hash="hash123",
            title_ja="日本語",
            title_en="English",
            content_ja=None,
            content_en=None,
            category="News",
            date="2025-01-15",
            url="https://example.com",
            created_at=now,
            updated_at=now,
        )

        assert cache.is_cache_stale(cached) is False

    def test_is_cache_stale_old(self, cache):
        """Test cache is stale when old."""
        from datetime import timedelta

        old_time = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
        cached = CachedTranslation(
            news_id="test123",
            content_hash="hash123",
            title_ja="日本語",
            title_en="English",
            content_ja=None,
            content_en=None,
            category="News",
            date="2025-01-15",
            url="https://example.com",
            created_at=old_time,
            updated_at=old_time,
        )

        assert cache.is_cache_stale(cached) is True

    def test_is_cache_stale_custom_age(self, cache):
        """Test cache staleness with custom max age."""
        from datetime import timedelta

        # 2 hours old
        old_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        cached = CachedTranslation(
            news_id="test123",
            content_hash="hash123",
            title_ja="日本語",
            title_en="English",
            content_ja=None,
            content_en=None,
            category="News",
            date="2025-01-15",
            url="https://example.com",
            created_at=old_time,
            updated_at=old_time,
        )

        # Not stale with 6 hour window (default)
        assert cache.is_cache_stale(cached, max_age_hours=6) is False
        # Stale with 1 hour window
        assert cache.is_cache_stale(cached, max_age_hours=1) is True

    def test_is_cache_stale_invalid_timestamp(self, cache):
        """Test cache is stale when timestamp is invalid."""
        cached = CachedTranslation(
            news_id="test123",
            content_hash="hash123",
            title_ja="日本語",
            title_en="English",
            content_ja=None,
            content_en=None,
            category="News",
            date="2025-01-15",
            url="https://example.com",
            created_at="invalid",
            updated_at="invalid",
        )

        assert cache.is_cache_stale(cached) is True


class TestCachedTranslation:
    """Tests for CachedTranslation dataclass."""

    def test_creation(self):
        cached = CachedTranslation(
            news_id="test123",
            content_hash="hash123",
            title_en="English Title",
            content_en="English content",
            category="News",
            date="2025-01-15",
            url="https://example.com",
            title_ja="日本語タイトル",
            content_ja="日本語本文",
            created_at="2025-01-15T10:00:00Z",
            updated_at="2025-01-15T10:00:00Z",
        )

        assert cached.news_id == "test123"
        assert cached.title_en == "English Title"
        assert cached.content_en == "English content"

    def test_optional_content(self):
        """Test that content fields are optional."""
        cached = CachedTranslation(
            news_id="test123",
            content_hash="hash123",
            title_en="English Title",
            content_en=None,
            category="News",
            date="2025-01-15",
            url="https://example.com",
            title_ja="日本語タイトル",
            content_ja=None,
            created_at="2025-01-15T10:00:00Z",
            updated_at="2025-01-15T10:00:00Z",
        )

        assert cached.content_en is None
        assert cached.content_ja is None
