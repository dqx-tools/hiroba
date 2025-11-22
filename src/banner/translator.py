"""Image text translation using OpenAI vision."""

from __future__ import annotations

import unicodedata
from json import loads
from typing import TYPE_CHECKING

import textdistance

from .text_style import image_to_data_uri

if TYPE_CHECKING:
    from openai import OpenAI
    from PIL import Image

TRANSLATION_PROMPT = """
Translate this image from Japanese to English. Please return values for the following pieces of text extracted from the
image (which may not be accurate to what you read, it's from a legacy OCR system and has lower accuracy than you do).
Return the result in the form of a JSON object where the keys are these original strings and the values are your
translated output. Return only JSON, do not include any other information. Do not wrap it in markdown. For context,
the image is an event banner image for Dragon Quest X, a popular MMORPG in Japan.
"""


def _fuzzy_dict_lookup(dictionary: dict[str, str], key: str) -> str:
    """Find the best matching key in a dictionary using fuzzy matching."""
    best_match: tuple[float, str] = (0.0, "")
    for dict_key in dictionary:
        match = textdistance.cosine.normalized_similarity(key, dict_key)
        if match > best_match[0]:
            best_match = (match, dictionary[dict_key])
    return best_match[1]


class ImageTranslator:
    """Translates text in images using OpenAI vision."""

    def __init__(self, client: OpenAI, model: str = "gpt-4o"):
        self.client = client
        self.model = model

    def translate_texts(
        self, image: Image.Image, texts: list[str]
    ) -> dict[str, str]:
        """
        Translate a list of texts found in an image.

        Uses the image for context to produce more accurate translations
        of the OCR-detected text.

        Args:
            image: The source image for context
            texts: List of Japanese text strings to translate

        Returns:
            Dictionary mapping original texts to translations
        """
        # Normalize all texts
        texts = [unicodedata.normalize("NFC", text) for text in texts]
        image_data_uri = image_to_data_uri(image)

        completion = self.client.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": TRANSLATION_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": image_data_uri}},
                        {"type": "text", "text": "\n".join(texts)},
                    ],
                },
            ],
        )

        translations = loads(completion.choices[0].message.content)

        # Use fuzzy matching to handle OCR inconsistencies
        return {
            key: _fuzzy_dict_lookup(translations, unicodedata.normalize("NFC", key))
            for key in texts
        }
