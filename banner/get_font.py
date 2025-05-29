import httpx
import io
from PIL import Image
import logging
from typing import Union

# Set up logging
logger = logging.getLogger(__name__)

API_URL = "https://backend.hellofont.app/fontKit/ai/ocrFont"

async def get_font(
  image: Image,
  timeout: int = 30
) -> Union[str, None]:
  """
  Send an image to the OCR API endpoint as a multipart form.

  Args:
    image: PIL Image to send
    timeout: Request timeout in seconds

  Returns:
    String containing the font name
  """
  # Set up headers with referer and origin
  headers = {
    "Referer": "https://fontkit.ai",
    "Origin": "https://fontkit.ai",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0NGJjOGRkNy1hYTI4LTRhY2MtOWFiNy02NzFkMzdiNmM3NDEiLCJjcmVhdGVkIjoxNzQyMzY1Mzg2ODY4LCJleHAiOjE3NDM1NzQ5ODZ9.yCpRHrD89YPwI9n2yevHS8SbCEYDaNlK-Bzq6pL7Wds"
  }

  # Convert image to bytes
  img_byte_arr = io.BytesIO()
  image.save(img_byte_arr, format="PNG")
  img_byte_arr.seek(0)

  # Create form data
  files = {
    "file": ("image.png", img_byte_arr, f"image/png")
  }

  # Send request
  async with httpx.AsyncClient() as client:
    response = await client.post(
      API_URL,
      headers=headers,
      files=files,
      timeout=timeout
    )

  # Check response status
  response.raise_for_status()

  line = response.json()['result']['text_lines']

  if 0 in line:
    return line[0]['font_name']
  else:
    return None
