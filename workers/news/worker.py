"""Cloudflare Workers entry point for DQX News API."""

from typing import Any

from workers import WorkerEntrypoint


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


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        import asgi
        from src.dqx_news.api import create_app

        # Get configuration from environment
        openai_api_key = self.env.OPENAI_API_KEY
        openai_model = getattr(self.env, "OPENAI_MODEL", "gpt-5.1")

        # Wrap D1 database
        db = D1DatabaseWrapper(self.env.DB)

        # Create FastAPI app
        app = create_app(db, openai_api_key, openai_model)


        return await asgi.fetch(app, request.js_object, self.env)

    async def scheduled(self, controller, env, ctx):
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
