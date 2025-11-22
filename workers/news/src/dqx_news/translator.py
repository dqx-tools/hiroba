"""Translation service using LangChain with OpenAI GPT-5."""

import hashlib
from dataclasses import dataclass
from typing import Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from .scraper import NewsDetail, NewsItem


@dataclass
class TranslatedNewsItem:
    """Translated news item."""

    id: str
    title_ja: str
    title_en: str
    date: str
    url: str
    category: str
    category_ja: str


@dataclass
class TranslatedNewsDetail:
    """Translated full news article."""

    id: str
    title_ja: str
    title_en: str
    date: str
    url: str
    category: str
    category_ja: str
    content_ja: str
    content_en: str
    content_hash: str


class DQXTranslator:
    """Translator for DQX news using LangChain and OpenAI."""

    def __init__(
        self,
        openai_api_key: str,
        model: str = "gpt-4.5-preview",
        temperature: float = 0.3,
    ):
        self.llm = ChatOpenAI(
            model=model,  # type: ignore[arg-type]
            temperature=temperature,
            api_key=openai_api_key,  # type: ignore[arg-type]
        )

        self.title_prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    """You are a professional translator specializing in Japanese video game content,
particularly Dragon Quest X (DQX) online game. Translate the following Japanese text to natural English.
Keep game-specific terms, item names, and location names that players would recognize.
Be concise but accurate.""",
                ),
                ("human", "Translate this Japanese title to English:\n\n{text}"),
            ]
        )

        self.content_prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    """You are a professional translator specializing in Japanese video game content,
particularly Dragon Quest X (DQX) online game. Translate the following Japanese text to natural English.

Guidelines:
- Keep game-specific terms, item names, location names, and character names that players would recognize
- Preserve any formatting like bullet points, numbered lists, dates, and times
- Convert Japanese date/time formats to be internationally readable while keeping original values
- Keep URLs and technical identifiers unchanged
- Maintain the original tone (official announcements should sound official)
- If there are instructions or steps, ensure they remain clear and actionable""",
                ),
                ("human", "Translate this Japanese content to English:\n\n{text}"),
            ]
        )

        self.title_chain = self.title_prompt | self.llm
        self.content_chain = self.content_prompt | self.llm

    @staticmethod
    def compute_content_hash(content: str) -> str:
        """Compute hash of content for cache invalidation."""
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    async def translate_title(self, title: str) -> str:
        """Translate a news title."""
        if not title.strip():
            return ""

        result = await self.title_chain.ainvoke({"text": title})
        return result.content.strip()

    async def translate_content(self, content: str) -> str:
        """Translate news content."""
        if not content.strip():
            return ""

        result = await self.content_chain.ainvoke({"text": content})
        return result.content.strip()

    async def translate_news_item(self, item: NewsItem) -> TranslatedNewsItem:
        """Translate a news listing item."""
        title_en = await self.translate_title(item.title)

        return TranslatedNewsItem(
            id=item.id,
            title_ja=item.title,
            title_en=title_en,
            date=item.date,
            url=item.url,
            category=item.category.english_name,
            category_ja=item.category.japanese_name,
        )

    async def translate_news_detail(
        self, detail: NewsDetail, cached_translation: Optional[str] = None
    ) -> TranslatedNewsDetail:
        """Translate a full news article."""
        title_en = await self.translate_title(detail.title)

        # Use cached translation if content hasn't changed
        content_hash = self.compute_content_hash(detail.content_text)
        if cached_translation:
            content_en = cached_translation
        else:
            content_en = await self.translate_content(detail.content_text)

        return TranslatedNewsDetail(
            id=detail.id,
            title_ja=detail.title,
            title_en=title_en,
            date=detail.date,
            url=detail.url,
            category=detail.category.english_name,
            category_ja=detail.category.japanese_name,
            content_ja=detail.content_text,
            content_en=content_en,
            content_hash=content_hash,
        )
