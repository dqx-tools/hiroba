"""Banner translation module for DQX hiroba banners."""

from .bounding_boxes import (
    boxes_overlap,
    boxes_vertically_aligned,
    calculate_iou,
    clean_text_annotations,
    merge_boxes,
)
from .font import FONT_MAPPINGS, FontMapper
from .image_utils import extract_box_region, load_image_from_url
from .inpaint import inpaint_text_regions
from .models import (
    BoundingBox,
    Point,
    Slide,
    TextAnnotation,
    TextStyle,
    TranslatedText,
)
from .ocr import detect_text
from .pipeline import BannerTranslator
from .renderer import render_svg
from .slides import get_banner_slides
from .text_style import (
    TextStyleExtractor,
    get_dominant_colors,
    hex_to_rgb,
    image_to_data_uri,
    rgb_to_hex,
)
from .translator import ImageTranslator

__all__ = [
    # Models
    "BoundingBox",
    "Point",
    "Slide",
    "TextAnnotation",
    "TextStyle",
    "TranslatedText",
    # Bounding boxes
    "boxes_overlap",
    "boxes_vertically_aligned",
    "calculate_iou",
    "clean_text_annotations",
    "merge_boxes",
    # Font
    "FONT_MAPPINGS",
    "FontMapper",
    # Image utilities
    "extract_box_region",
    "load_image_from_url",
    # Inpainting
    "inpaint_text_regions",
    # OCR
    "detect_text",
    # Pipeline
    "BannerTranslator",
    # Rendering
    "render_svg",
    # Slides
    "get_banner_slides",
    # Text style
    "TextStyleExtractor",
    "get_dominant_colors",
    "hex_to_rgb",
    "image_to_data_uri",
    "rgb_to_hex",
    # Translation
    "ImageTranslator",
]
