"""Cloudflare Workers entry point for DQX Banner Translation API."""

import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


async def on_fetch(request, env):
    """
    Cloudflare Workers fetch handler for banner translation.

    This is the entry point for all HTTP requests to the Worker.
    """
    from js import Response, Headers  # type: ignore[import-not-found]
    from urllib.parse import urlparse
    import json

    url = urlparse(request.url)
    path = url.path

    # Health check endpoint
    if path == "/health" or path == "/health/":
        headers = Headers.new()
        headers.set("Content-Type", "application/json")
        return Response.new(
            json.dumps({"status": "healthy", "service": "dqx-banner-api"}),
            status=200,
            headers=headers,
        )

    # Root endpoint
    if path == "/" or path == "":
        headers = Headers.new()
        headers.set("Content-Type", "application/json")
        return Response.new(
            json.dumps({
                "service": "DQX Banner Translation API",
                "version": "1.0.0",
                "status": "not_deployed",
                "message": "Banner translation routes are not yet configured.",
            }),
            status=200,
            headers=headers,
        )

    # Not found
    headers = Headers.new()
    headers.set("Content-Type", "application/json")
    return Response.new(
        json.dumps({"error": "Not found"}),
        status=404,
        headers=headers,
    )


# Export handler for Cloudflare Workers
fetch = on_fetch
