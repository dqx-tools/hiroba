"""FastAPI-based API for DQX news translations."""

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from .cache import D1Cache, D1Database
from .scraper import DQXNewsScraper, NewsCategory
from .translator import DQXTranslator


class NewsListItem(BaseModel):
    """API response model for news list item."""

    id: str
    title_ja: str
    title_en: str
    date: str
    url: str
    category: str
    category_ja: str


class NewsListResponse(BaseModel):
    """API response model for news listing."""

    items: list[NewsListItem]
    total: int
    page: int
    page_size: int
    has_more: bool


class NewsDetailResponse(BaseModel):
    """API response model for news detail."""

    id: str
    title_ja: str
    title_en: str
    date: str
    url: str
    category: str
    category_ja: str
    content_ja: str
    content_en: str
    cached: bool


class RefreshResponse(BaseModel):
    """API response for refresh operation."""

    refreshed: int
    errors: int
    message: str


def create_app(
    db: D1Database,
    openai_api_key: str,
    openai_model: str = "gpt-4.5-preview",
) -> FastAPI:
    """Create FastAPI application with dependencies."""

    cache = D1Cache(db)
    translator = DQXTranslator(openai_api_key, model=openai_model)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup
        await cache.initialize()
        yield
        # Shutdown (nothing to clean up)

    app = FastAPI(
        title="DQX News API",
        description="Translated Dragon Quest X news from hiroba.dqx.jp",
        version="1.0.0",
        lifespan=lifespan,
    )

    @app.get("/")
    async def root():
        return {
            "service": "DQX News API",
            "version": "1.0.0",
            "endpoints": {
                "news_list": "/news",
                "news_detail": "/news/{news_id}",
                "categories": "/categories",
                "refresh": "/refresh",
            },
        }

    @app.get("/categories")
    async def get_categories():
        """Get available news categories."""
        return {
            "categories": [
                {
                    "id": cat.value,
                    "name": cat.english_name,
                    "name_ja": cat.japanese_name,
                }
                for cat in NewsCategory
            ]
        }

    @app.get("/news", response_model=NewsListResponse)
    async def get_news_list(
        category: Optional[str] = Query(None, description="Filter by category name"),
        page: int = Query(1, ge=1, description="Page number"),
        page_size: int = Query(50, ge=1, le=100, description="Items per page"),
        refresh: bool = Query(False, description="Force refresh from source"),
    ):
        """Get translated news listing."""
        offset = (page - 1) * page_size

        # If refresh requested or cache empty, fetch from source
        if refresh:
            await _refresh_listings(cache, translator, category)

        # Get from cache
        category_filter = category.capitalize() if category else None
        cached_items = await cache.get_listings(
            category=category_filter, limit=page_size, offset=offset
        )
        total = await cache.get_count(category=category_filter)

        items = [
            NewsListItem(
                id=item.news_id,
                title_ja=item.title_ja,
                title_en=item.title_en,
                date=item.date,
                url=item.url,
                category=item.category,
                category_ja=_get_japanese_category(item.category),
            )
            for item in cached_items
        ]

        return NewsListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=offset + len(items) < total,
        )

    @app.get("/news/{news_id}", response_model=NewsDetailResponse)
    async def get_news_detail(news_id: str, refresh: bool = Query(False)):
        """Get translated news detail."""
        # Check cache first
        cached = await cache.get_translation(news_id)

        if cached and cached.content_en and not refresh:
            return NewsDetailResponse(
                id=cached.news_id,
                title_ja=cached.title_ja,
                title_en=cached.title_en,
                date=cached.date,
                url=cached.url,
                category=cached.category,
                category_ja=_get_japanese_category(cached.category),
                content_ja=cached.content_ja or "",
                content_en=cached.content_en,
                cached=True,
            )

        # Fetch and translate
        async with DQXNewsScraper() as scraper:
            try:
                detail = await scraper.get_news_detail(news_id)
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"News not found: {e}")

        # Check if we can use cached translation
        content_hash = translator.compute_content_hash(detail.content_text)
        cached_valid = await cache.get_translation_if_valid(news_id, content_hash)

        if cached_valid and cached_valid.content_en:
            translated = await translator.translate_news_detail(
                detail, cached_translation=cached_valid.content_en
            )
        else:
            translated = await translator.translate_news_detail(detail)

        # Save to cache
        await cache.save_translation(
            news_id=translated.id,
            content_hash=translated.content_hash,
            title_ja=translated.title_ja,
            title_en=translated.title_en,
            category=translated.category,
            date=translated.date,
            url=translated.url,
            content_ja=translated.content_ja,
            content_en=translated.content_en,
        )

        return NewsDetailResponse(
            id=translated.id,
            title_ja=translated.title_ja,
            title_en=translated.title_en,
            date=translated.date,
            url=translated.url,
            category=translated.category,
            category_ja=translated.category_ja,
            content_ja=translated.content_ja,
            content_en=translated.content_en,
            cached=False,
        )

    @app.post("/refresh", response_model=RefreshResponse)
    async def refresh_news(
        category: Optional[str] = Query(None),
        max_pages: int = Query(1, ge=1, le=10),
    ):
        """Refresh news from source and translate."""
        refreshed, errors = await _refresh_listings(
            cache, translator, category, max_pages
        )
        return RefreshResponse(
            refreshed=refreshed,
            errors=errors,
            message=f"Refreshed {refreshed} items with {errors} errors",
        )

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy"}

    return app


def _get_japanese_category(category: str) -> str:
    """Get Japanese name for category."""
    mapping = {
        "News": "ニュース",
        "Events": "イベント",
        "Updates": "アップデート",
        "Maintenance": "メンテナンス/障害",
    }
    return mapping.get(category, category)


async def _refresh_listings(
    cache: D1Cache,
    translator: DQXTranslator,
    category: Optional[str] = None,
    max_pages: int = 1,
) -> tuple[int, int]:
    """Refresh news listings from source."""
    refreshed = 0
    errors = 0

    # Determine categories to refresh
    if category:
        category_map = {cat.english_name.lower(): cat for cat in NewsCategory}
        if category.lower() in category_map:
            categories = [category_map[category.lower()]]
        else:
            return 0, 0
    else:
        categories = list(NewsCategory)

    async with DQXNewsScraper() as scraper:
        for cat in categories:
            try:
                items, _ = await scraper.get_news_listing(cat, page=1)

                for item in items[:50]:  # Limit per category
                    try:
                        # Check if already cached with same title
                        cached = await cache.get_translation(item.id)
                        if cached and cached.title_ja == item.title:
                            continue

                        # Translate title only for listing
                        translated = await translator.translate_news_item(item)

                        # Save to cache (without full content)
                        content_hash = translator.compute_content_hash(item.title)
                        await cache.save_translation(
                            news_id=translated.id,
                            content_hash=content_hash,
                            title_ja=translated.title_ja,
                            title_en=translated.title_en,
                            category=translated.category,
                            date=translated.date,
                            url=translated.url,
                        )
                        refreshed += 1
                    except Exception:
                        errors += 1

            except Exception:
                errors += 1

    return refreshed, errors
