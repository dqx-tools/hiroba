"""Cloudflare Workers entry point using pywrangler/pyodide."""

import os
from typing import Any

# This module is designed to run in Cloudflare Workers with Python support
# It bridges the Workers runtime with our FastAPI application


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
    from js import Response, Headers
    from urllib.parse import urlparse

    # Import here to avoid issues with Pyodide module loading
    from .api import create_app

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
    # In production, you'd use a proper ASGI adapter
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "query_string": (url.query or "").encode(),
        "headers": [(k.lower().encode(), v.encode()) for k, v in request.headers],
    }

    # For a full implementation, you'd need an ASGI adapter
    # This is a simplified version for demonstration
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


# Export for Cloudflare Workers
fetch = on_fetch
