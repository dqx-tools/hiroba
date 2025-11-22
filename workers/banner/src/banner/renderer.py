"""SVG rendering for translated banners."""

import math
from xml.sax.saxutils import escape

from PIL import Image

from .models import TranslatedText
from .text_style import image_to_data_uri


def render_svg(
    background_image: Image.Image,
    translated_texts: list[TranslatedText],
) -> str:
    """
    Render translated texts as an SVG overlay on an image.

    Args:
        background_image: The inpainted background image
        translated_texts: List of translated text elements with positioning

    Returns:
        SVG string with the rendered banner
    """
    width = background_image.width
    height = background_image.height

    svg_parts = [
        f'<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">',
        f'<image href="{image_to_data_uri(background_image)}" width="{width}" height="{height}" />',
    ]

    for text in translated_texts:
        box = text.bounding_box
        style = text.style
        center = box.center
        box_width, _ = box.dimensions
        angle_deg = math.degrees(box.angle)

        text_elem = (
            f'<text x="{center.x}" y="{center.y}" '
            f'fill="{style.foreground_color}" '
            f'stroke="{style.border_color}" stroke-width="2" '
            f'font-weight="{style.font_weight}" '
            f'font-family="{text.font_family}" '
            f'dominant-baseline="middle" '
            f'font-size="{style.font_size}" '
            f'text-anchor="middle" '
            f'paint-order="stroke fill" '
            f'textLength="{box_width}" '
            f'lengthAdjust="spacingAndGlyphs" '
            f'transform="rotate({angle_deg})" '
            f'transform-origin="center">'
            f"{escape(text.translated)}</text>"
        )
        svg_parts.append(text_elem)

    svg_parts.append("</svg>")
    return "\n".join(svg_parts)
