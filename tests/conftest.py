"""Pytest configuration and shared fixtures."""

import sys
from pathlib import Path

import pytest

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture
def sample_news_html():
    """Sample news listing HTML for testing."""
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
def sample_detail_html():
    """Sample news detail HTML for testing."""
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
