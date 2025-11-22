"""Main banner translation pipeline."""

from __future__ import annotations

from typing import TYPE_CHECKING

from .bounding_boxes import clean_text_annotations
from .font import FontMapper
from .image_utils import extract_box_region, load_image_from_url
from .inpaint import inpaint_text_regions
from .models import TranslatedText
from .ocr import detect_text
from .renderer import render_svg
from .slides import get_banner_slides
from .text_style import TextStyleExtractor
from .translator import ImageTranslator

if TYPE_CHECKING:
    import httpx
    from openai import OpenAI
    from PIL import Image

    from .models import Slide


class BannerTranslator:
    """
    Complete pipeline for translating DQX banner images.

    Handles the full process:
    1. OCR text detection
    2. Bounding box cleaning/merging
    3. Text region inpainting
    4. Text translation
    5. Style extraction
    6. SVG rendering
    """

    def __init__(
        self,
        openai_client: OpenAI,
        translation_model: str = "gpt-4o",
        style_model: str = "gpt-4o",
        font_model: str = "gpt-4o-mini",
    ):
        """
        Initialize the banner translator.

        Args:
            openai_client: OpenAI client for API calls
            translation_model: Model to use for text translation
            style_model: Model to use for style extraction
            font_model: Model to use for font mapping
        """
        self.translator = ImageTranslator(openai_client, model=translation_model)
        self.style_extractor = TextStyleExtractor(openai_client, model=style_model)
        self.font_mapper = FontMapper(openai_client, model=font_model)

    async def translate_image_url(self, image_url: str) -> str:
        """
        Translate a banner image from a URL.

        Args:
            image_url: URL of the banner image

        Returns:
            SVG string with translated banner
        """
        image = await load_image_from_url(image_url)
        return await self.translate_image(image, image_url)

    async def translate_image(
        self, image: Image.Image, source_url: str | None = None
    ) -> str:
        """
        Translate a banner image.

        Args:
            image: PIL Image to translate
            source_url: Optional URL for OCR (Google Vision needs URL)

        Returns:
            SVG string with translated banner
        """
        if source_url is None:
            raise ValueError("source_url is required for Google Cloud Vision OCR")

        # Step 1: Detect text using OCR
        raw_annotations = detect_text(source_url)

        # Step 2: Clean and merge bounding boxes
        annotations = clean_text_annotations(raw_annotations)

        if not annotations:
            # No text found, return original image as SVG
            return render_svg(image, [])

        # Step 3: Inpaint text regions
        inpainted_image = inpaint_text_regions(image, annotations)

        # Step 4: Translate all texts
        texts = [ann.description for ann in annotations]
        translations = self.translator.translate_texts(image, texts)

        # Step 5: Extract styles and build translated text objects
        translated_texts = []
        for annotation in annotations:
            box_image = extract_box_region(image, annotation.bounding_poly)
            style = self.style_extractor.extract(box_image)

            original = annotation.description
            translated = translations.get(original, original)

            translated_texts.append(
                TranslatedText(
                    original=original,
                    translated=translated,
                    bounding_box=annotation.bounding_poly,
                    style=style,
                    font_family="Open Sans",  # Could use font_mapper here
                )
            )

        # Step 6: Render SVG
        return render_svg(inpainted_image, translated_texts)

    async def translate_all_banners(
        self, client: httpx.AsyncClient | None = None
    ) -> list[tuple[Slide, str]]:
        """
        Translate all current rotation banners.

        Args:
            client: Optional httpx client

        Returns:
            List of (Slide, SVG) tuples
        """
        slides = await get_banner_slides(client)
        results = []

        for slide in slides:
            if slide.src:
                try:
                    svg = await self.translate_image_url(slide.src)
                    results.append((slide, svg))
                except Exception as e:
                    # Log error but continue with other slides
                    print(f"Error translating {slide.src}: {e}")

        return results
