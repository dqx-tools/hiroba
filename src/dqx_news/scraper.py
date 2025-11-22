"""DQX News scraper for extracting news listings and content."""

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup


class NewsCategory(Enum):
    """DQX news categories."""

    NEWS = 0  # ニュース
    EVENTS = 1  # イベント
    UPDATES = 2  # アップデート
    MAINTENANCE = 3  # メンテナンス/障害

    @property
    def japanese_name(self) -> str:
        names = {
            NewsCategory.NEWS: "ニュース",
            NewsCategory.EVENTS: "イベント",
            NewsCategory.UPDATES: "アップデート",
            NewsCategory.MAINTENANCE: "メンテナンス/障害",
        }
        return names[self]

    @property
    def english_name(self) -> str:
        names = {
            NewsCategory.NEWS: "News",
            NewsCategory.EVENTS: "Events",
            NewsCategory.UPDATES: "Updates",
            NewsCategory.MAINTENANCE: "Maintenance",
        }
        return names[self]


@dataclass
class NewsItem:
    """A news item from the listing page."""

    id: str
    title: str
    date: str
    url: str
    category: NewsCategory


@dataclass
class NewsDetail:
    """Full news article content."""

    id: str
    title: str
    date: str
    category: NewsCategory
    content_html: str
    content_text: str
    url: str


class DQXNewsScraper:
    """Scraper for DQX Hiroba news pages."""

    BASE_URL = "https://hiroba.dqx.jp"
    NEWS_LIST_URL = "/sc/news/category/{category}"
    NEWS_DETAIL_URL = "/sc/news/detail/{news_id}/"

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client
        self._owns_client = client is None

    async def __aenter__(self):
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=30.0,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
            )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._owns_client and self._client:
            await self._client.aclose()

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("Scraper must be used as async context manager")
        return self._client

    async def get_news_listing(
        self, category: NewsCategory, page: int = 1
    ) -> tuple[list[NewsItem], int]:
        """
        Fetch news listing for a category.

        Returns:
            Tuple of (news_items, total_pages)
        """
        url = self.BASE_URL + self.NEWS_LIST_URL.format(category=category.value)
        if page > 1:
            url += f"/{page}"

        response = await self.client.get(url)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        items = []

        # Find all news links
        news_links = soup.find_all("a", href=re.compile(r"/sc/news/detail/[^/]+/?"))

        for link in news_links:
            href = link.get("href", "")
            # Extract news ID from URL
            match = re.search(r"/sc/news/detail/([^/]+)/?", href)
            if not match:
                continue

            news_id = match.group(1)
            title = link.get_text(strip=True)

            # Skip empty titles or navigation links
            if not title or title in ["詳細", "もっと見る"]:
                continue

            # Try to find date - usually in a sibling or parent element
            date = self._extract_date_near_element(link)

            full_url = urljoin(self.BASE_URL, href)

            items.append(
                NewsItem(
                    id=news_id,
                    title=title,
                    date=date,
                    url=full_url,
                    category=category,
                )
            )

        # Extract total pages from pagination
        total_pages = self._extract_total_pages(soup)

        return items, total_pages

    def _extract_date_near_element(self, element) -> str:
        """Extract date from near the element."""
        # Look for date pattern in parent's text
        parent = element.find_parent()
        if parent:
            text = parent.get_text()
            # Match YYYY-MM-DD or YYYY/MM/DD with optional time
            match = re.search(
                r"(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)", text
            )
            if match:
                return match.group(1)

        # Look in siblings
        for sibling in element.find_next_siblings(limit=3):
            text = sibling.get_text() if hasattr(sibling, "get_text") else str(sibling)
            match = re.search(r"(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)", text)
            if match:
                return match.group(1)

        return ""

    def _extract_total_pages(self, soup: BeautifulSoup) -> int:
        """Extract total number of pages from pagination."""
        # Look for pagination links
        pagination = soup.find_all("a", href=re.compile(r"/sc/news/category/\d+/\d+"))
        max_page = 1

        for link in pagination:
            href = link.get("href", "")
            match = re.search(r"/sc/news/category/\d+/(\d+)", href)
            if match:
                page_num = int(match.group(1))
                max_page = max(max_page, page_num)

        # Also check for "last" link text that might contain page number
        last_link = soup.find("a", string=re.compile(r"last|最後"))
        if last_link:
            href = last_link.get("href", "")
            match = re.search(r"/(\d+)/?$", href)
            if match:
                max_page = max(max_page, int(match.group(1)))

        return max_page

    async def get_news_detail(self, news_id: str) -> NewsDetail:
        """Fetch full news article content."""
        url = self.BASE_URL + self.NEWS_DETAIL_URL.format(news_id=news_id)

        response = await self.client.get(url)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # Extract title - usually in h1 or main heading
        title = ""
        title_elem = soup.find("h1") or soup.find(class_=re.compile(r"title|heading"))
        if title_elem:
            title = title_elem.get_text(strip=True)

        # Extract date
        date = ""
        date_match = re.search(
            r"(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)", response.text
        )
        if date_match:
            date = date_match.group(1)

        # Determine category from breadcrumbs or navigation
        category = self._detect_category(soup)

        # Extract main content
        content_html, content_text = self._extract_content(soup)

        return NewsDetail(
            id=news_id,
            title=title,
            date=date,
            category=category,
            content_html=content_html,
            content_text=content_text,
            url=url,
        )

    def _detect_category(self, soup: BeautifulSoup) -> NewsCategory:
        """Detect news category from page content."""
        # Look for category links in navigation/breadcrumbs
        for cat in NewsCategory:
            if soup.find("a", href=re.compile(f"/sc/news/category/{cat.value}")):
                # Check if it's highlighted/active
                link = soup.find("a", href=re.compile(f"/sc/news/category/{cat.value}"))
                if link and ("current" in link.get("class", []) or "active" in link.get("class", [])):
                    return cat

        # Default to NEWS
        return NewsCategory.NEWS

    def _extract_content(self, soup: BeautifulSoup) -> tuple[str, str]:
        """Extract main article content."""
        # Try to find main content area
        content_selectors = [
            ("div", {"class": re.compile(r"newsdetail|article|content|body")}),
            ("article", {}),
            ("main", {}),
        ]

        content_elem = None
        for tag, attrs in content_selectors:
            content_elem = soup.find(tag, attrs)
            if content_elem:
                break

        if not content_elem:
            # Fallback: get body and remove navigation elements
            content_elem = soup.find("body")
            if content_elem:
                # Remove navigation, header, footer
                for elem in content_elem.find_all(
                    ["nav", "header", "footer", "script", "style"]
                ):
                    elem.decompose()

        if content_elem:
            content_html = str(content_elem)
            content_text = content_elem.get_text(separator="\n", strip=True)
        else:
            content_html = ""
            content_text = ""

        return content_html, content_text

    async def get_all_listings(
        self, categories: Optional[list[NewsCategory]] = None, max_pages: int = 1
    ) -> list[NewsItem]:
        """Fetch news listings from multiple categories."""
        if categories is None:
            categories = list(NewsCategory)

        all_items = []
        for category in categories:
            for page in range(1, max_pages + 1):
                items, total_pages = await self.get_news_listing(category, page)
                all_items.extend(items)
                if page >= total_pages:
                    break

        return all_items
