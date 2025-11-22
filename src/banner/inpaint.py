"""Image inpainting to remove text regions using Replicate."""

import base64
import io

import replicate
from PIL import Image

from .models import TextAnnotation


async def inpaint_text_regions(
    image: Image.Image,
    annotations: list[TextAnnotation],  # noqa: ARG001 - kept for API compatibility
) -> Image.Image:
    """
    Inpaint regions of an image to remove text using Replicate.

    Uses the qwen/qwen-image-edit-plus model with the prompt
    "Remove the text from the image".

    Args:
        image: PIL Image to inpaint
        annotations: List of TextAnnotation objects (kept for API compatibility,
                    but the AI model handles text detection internally)

    Returns:
        PIL Image with text regions inpainted
    """
    # Convert PIL Image to base64 data URI
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    image_data_uri = f"data:image/png;base64,{image_base64}"

    # Call Replicate API
    output = await replicate.async_run(
        "qwen/qwen-image-edit-plus",
        input={
            "image": image_data_uri,
            "prompt": "Remove the text from the image",
        },
    )

    # Handle different output formats
    if isinstance(output, list) and len(output) > 0:
        output_url = output[0]
    else:
        output_url = output

    # Download and return the result image
    import httpx

    async with httpx.AsyncClient() as client:
        response = await client.get(str(output_url))
        response.raise_for_status()
        return Image.open(io.BytesIO(response.content))
