"""Font detection and mapping to Latin equivalents."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openai import OpenAI

# Explicit mappings for known Japanese fonts to Latin equivalents
FONT_MAPPINGS = {
    "ライラ": "Laila",
    "Kurokane": "Black Han Sans",
    "Seurat": "Nunito",
    "GMaruGo": "Nunito",
    "TelopMin": "Sorts Mill Goudy",
    "LapisEdge": "Roboto",
    "NewCezanne": "Roboto",
}

FONT_ANALOGUE_PROMPT = """
Please find a similar font with support for the Latin alphabet, available on Google Fonts. Try to
match style as best as you can, don't just cop out and say "Open Sans". It may help to think about
this font's unique attributes, style, and whatnot. Remember that the font doesn't need to be
Latin-first, just have support for Latin. Respond with nothing but the font name, and don't include
any other information or quotes.
"""


class FontMapper:
    """Maps Japanese fonts to Latin equivalents using OpenAI."""

    def __init__(self, client: OpenAI, model: str = "gpt-4o-mini"):
        self.client = client
        self.model = model

    def get_latin_equivalent(self, font_name: str | None) -> str:
        """
        Get a Latin-compatible equivalent font for a Japanese font.

        Args:
            font_name: The detected Japanese font name, or None

        Returns:
            Name of a Latin-compatible Google Font
        """
        if font_name is None:
            return "Open Sans"

        # Check explicit mappings first
        for key, value in FONT_MAPPINGS.items():
            if key in font_name:
                return value

        # Fall back to OpenAI for unknown fonts
        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "user", "content": FONT_ANALOGUE_PROMPT},
                {"role": "user", "content": font_name},
            ],
        )
        return completion.choices[0].message.content.strip()
