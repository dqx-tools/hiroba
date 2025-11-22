"""Cloudflare Workers entry point for DQX News API."""

import sys
from pathlib import Path
from typing import Any

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class D1DatabaseWrapper:
    """Wrapper for Cloudflare D1 database to match our protocol."""

    def __init__(self, d1_binding: Any):
        self._db = d1_binding

    async def execute(self, query: str, params: list | None = None):
        """Execute a SQL query."""
        if params:
            stmt = self._db.prepare(query).bind(*params)
        else:
            stmt = self._db.prepare(query)
        return await stmt.all()

    async def batch(self, statements: list):
        """Execute multiple statements in a batch."""
        prepared = [self._db.prepare(s) for s in statements]
        return await self._db.batch(prepared)


async def on_fetch(request, env):
    """
    Cloudflare Workers fetch handler.

    This is the entry point for all HTTP requests to the Worker.
    """
    from js import Response, Headers  # type: ignore[import-not-found]
    from urllib.parse import urlparse

    from src.dqx_news.api import create_app

    # Get configuration from environment
    openai_api_key = env.OPENAI_API_KEY
    openai_model = getattr(env, "OPENAI_MODEL", "gpt-4.5-preview")

    # Wrap D1 database
    db = D1DatabaseWrapper(env.DB)

    # Create FastAPI app
    app = create_app(db, openai_api_key, openai_model)

    # Parse request
    url = urlparse(request.url)
    path = url.path
    method = request.method

    # Simple routing to FastAPI
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "query_string": (url.query or "").encode(),
        "headers": [(k.lower().encode(), v.encode()) for k, v in request.headers],
    }

    response_body = []
    response_status = 200
    response_headers = {}

    async def receive():
        body = await request.text()
        return {"type": "http.request", "body": body.encode()}

    async def send(message):
        nonlocal response_status, response_headers
        if message["type"] == "http.response.start":
            response_status = message["status"]
            response_headers = dict(message.get("headers", []))
        elif message["type"] == "http.response.body":
            response_body.append(message.get("body", b""))

    await app(scope, receive, send)

    headers = Headers.new()
    for k, v in response_headers.items():
        if isinstance(k, bytes):
            k = k.decode()
        if isinstance(v, bytes):
            v = v.decode()
        headers.set(k, v)

    return Response.new(
        b"".join(response_body),
        status=response_status,
        headers=headers,
    )


async def on_scheduled(event, env, ctx):
    """
    Cloudflare Workers scheduled event handler.

    This is triggered by cron jobs to refresh news listings.
    """
    from src.dqx_news.cache import D1Cache
    from src.dqx_news.scraper import DQXNewsScraper, NewsCategory
    from src.dqx_news.translator import DQXTranslator

    # Get configuration from environment
    openai_api_key = env.OPENAI_API_KEY
    openai_model = getattr(env, "OPENAI_MODEL", "gpt-4.5-preview")

    # Wrap D1 database
    db = D1DatabaseWrapper(env.DB)
    cache = D1Cache(db)
    translator = DQXTranslator(openai_api_key, model=openai_model)

    # Initialize cache schema if needed
    await cache.initialize()

    # Refresh all categories
    refreshed = 0
    errors = 0

    async with DQXNewsScraper() as scraper:
        for category in NewsCategory:
            try:
                items, _ = await scraper.get_news_listing(category, page=1)

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

    print(f"Scheduled refresh complete: {refreshed} items refreshed, {errors} errors")


# Export handlers for Cloudflare Workers
fetch = on_fetch
scheduled = on_scheduled
