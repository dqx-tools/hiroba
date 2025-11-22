"""Cloudflare D1 caching layer for translations."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional, Protocol


class D1Database(Protocol):
    """Protocol for Cloudflare D1 database interface."""

    async def execute(self, query: str, params: Optional[list] = None) -> Any: ...
    async def batch(self, statements: list) -> list: ...


@dataclass
class CachedTranslation:
    """Cached translation record."""

    news_id: str
    content_hash: str
    title_en: str
    content_en: Optional[str]
    category: str
    date: str
    url: str
    title_ja: str
    content_ja: Optional[str]
    created_at: str
    updated_at: str


class D1Cache:
    """D1-based cache for DQX news translations."""

    # SQL for creating the cache table
    CREATE_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS news_translations (
        news_id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        title_ja TEXT NOT NULL,
        title_en TEXT NOT NULL,
        content_ja TEXT,
        content_en TEXT,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """

    CREATE_INDEX_SQL = """
    CREATE INDEX IF NOT EXISTS idx_news_category ON news_translations(category);
    CREATE INDEX IF NOT EXISTS idx_news_date ON news_translations(date DESC);
    CREATE INDEX IF NOT EXISTS idx_news_updated ON news_translations(updated_at DESC);
    """

    def __init__(self, db: D1Database):
        self.db = db

    async def initialize(self) -> None:
        """Initialize the database schema."""
        await self.db.execute(self.CREATE_TABLE_SQL)
        # Create indexes separately
        for index_sql in self.CREATE_INDEX_SQL.strip().split(";"):
            if index_sql.strip():
                await self.db.execute(index_sql)

    async def get_translation(self, news_id: str) -> Optional[CachedTranslation]:
        """Get cached translation by news ID."""
        result = await self.db.execute(
            "SELECT * FROM news_translations WHERE news_id = ?", [news_id]
        )

        if not result or not result.results:
            return None

        row = result.results[0]
        return CachedTranslation(
            news_id=row["news_id"],
            content_hash=row["content_hash"],
            title_ja=row["title_ja"],
            title_en=row["title_en"],
            content_ja=row.get("content_ja"),
            content_en=row.get("content_en"),
            category=row["category"],
            date=row["date"],
            url=row["url"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    async def get_translation_if_valid(
        self, news_id: str, content_hash: str
    ) -> Optional[CachedTranslation]:
        """Get cached translation only if content hash matches."""
        cached = await self.get_translation(news_id)
        if cached and cached.content_hash == content_hash:
            return cached
        return None

    async def save_translation(
        self,
        news_id: str,
        content_hash: str,
        title_ja: str,
        title_en: str,
        category: str,
        date: str,
        url: str,
        content_ja: Optional[str] = None,
        content_en: Optional[str] = None,
    ) -> None:
        """Save or update a translation in the cache."""
        now = datetime.now(timezone.utc).isoformat()

        await self.db.execute(
            """
            INSERT INTO news_translations
                (news_id, content_hash, title_ja, title_en, content_ja, content_en,
                 category, date, url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(news_id) DO UPDATE SET
                content_hash = excluded.content_hash,
                title_ja = excluded.title_ja,
                title_en = excluded.title_en,
                content_ja = excluded.content_ja,
                content_en = excluded.content_en,
                category = excluded.category,
                date = excluded.date,
                url = excluded.url,
                updated_at = excluded.updated_at
            """,
            [
                news_id,
                content_hash,
                title_ja,
                title_en,
                content_ja,
                content_en,
                category,
                date,
                url,
                now,
                now,
            ],
        )

    async def get_listings(
        self,
        category: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[CachedTranslation]:
        """Get cached news listings with optional filtering."""
        if category:
            result = await self.db.execute(
                """
                SELECT * FROM news_translations
                WHERE category = ?
                ORDER BY date DESC
                LIMIT ? OFFSET ?
                """,
                [category, limit, offset],
            )
        else:
            result = await self.db.execute(
                """
                SELECT * FROM news_translations
                ORDER BY date DESC
                LIMIT ? OFFSET ?
                """,
                [limit, offset],
            )

        if not result or not result.results:
            return []

        return [
            CachedTranslation(
                news_id=row["news_id"],
                content_hash=row["content_hash"],
                title_ja=row["title_ja"],
                title_en=row["title_en"],
                content_ja=row.get("content_ja"),
                content_en=row.get("content_en"),
                category=row["category"],
                date=row["date"],
                url=row["url"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in result.results
        ]

    async def get_count(self, category: Optional[str] = None) -> int:
        """Get total count of cached items."""
        if category:
            result = await self.db.execute(
                "SELECT COUNT(*) as count FROM news_translations WHERE category = ?",
                [category],
            )
        else:
            result = await self.db.execute(
                "SELECT COUNT(*) as count FROM news_translations"
            )

        if result and result.results:
            return result.results[0]["count"]
        return 0

    def is_cache_stale(self, cached: CachedTranslation, max_age_hours: int = 6) -> bool:
        """Check if cache entry needs revalidation based on updated_at timestamp."""
        try:
            updated = datetime.fromisoformat(cached.updated_at.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            age_hours = (now - updated).total_seconds() / 3600
            return age_hours > max_age_hours
        except (ValueError, AttributeError):
            return True  # Revalidate if we can't parse the timestamp
