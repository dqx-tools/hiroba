# Barohi.sc - DQX Translation Services

Translation services for Dragon Quest X content from hiroba.dqx.jp.

## Features

### News Translation API

- Extracts news listings from all 4 categories:
  - News (ニュース)
  - Events (イベント)
  - Updates (アップデート)
  - Maintenance (メンテナンス/障害)
- Translates Japanese content to English using LangChain + OpenAI
- Caches translations in Cloudflare D1 for fast responses
- RESTful API with pagination support

### Banner Translation

- Extracts rotation banner images from hiroba.dqx.jp
- OCR text detection using Google Cloud Vision
- Intelligent bounding box merging for multi-character text
- Text inpainting to remove original Japanese text
- Style extraction (colors, font weight) from text regions
- SVG rendering with translated text overlay

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and available endpoints |
| `/categories` | GET | List all news categories |
| `/news` | GET | Get translated news listings |
| `/news/{id}` | GET | Get translated news detail |
| `/refresh` | POST | Force refresh news from source |
| `/health` | GET | Health check |

### Query Parameters

**GET /news**
- `category` - Filter by category (news, events, updates, maintenance)
- `page` - Page number (default: 1)
- `page_size` - Items per page (default: 50, max: 100)
- `refresh` - Force refresh from source (default: false)

**GET /news/{id}**
- `refresh` - Force re-translation (default: false)

## Setup

### Prerequisites

- Python 3.12+
- Node.js (for wrangler CLI)
- Cloudflare account with Workers and D1 access
- OpenAI API key
- Google Cloud Vision API credentials (for banner OCR)

### Installation

```bash
# Install Python dependencies
uv sync

# Install dev dependencies
uv sync --extra dev

# Install wrangler
npm install -g wrangler
```

### Configure Cloudflare

1. Create D1 database:
```bash
wrangler d1 create dqx-news-cache
```

2. Update `wrangler.toml` with your D1 database ID

3. Set OpenAI API key:
```bash
wrangler secret put OPENAI_API_KEY
```

### Deploy

```bash
# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

## Development

### Run Tests

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=src --cov-report=html

# Run specific test file
uv run pytest tests/test_scraper.py -v
```

### Local Development

```bash
# Run FastAPI locally (without Workers)
uv run uvicorn src.dqx_news.api:app --reload

# Run with wrangler dev
wrangler dev
```

## Project Structure

```
├── src/
│   ├── dqx_news/           # News translation API
│   │   ├── __init__.py
│   │   ├── api.py          # FastAPI application
│   │   ├── cache.py        # D1 caching layer
│   │   ├── scraper.py      # News page scraper
│   │   ├── translator.py   # LangChain translation
│   │   └── worker.py       # Cloudflare Workers entry
│   │
│   └── banner/             # Banner translation
│       ├── __init__.py
│       ├── models.py       # Data models (Point, BoundingBox, etc.)
│       ├── ocr.py          # Google Cloud Vision OCR
│       ├── bounding_boxes.py  # Box merging algorithms
│       ├── inpaint.py      # Text region inpainting
│       ├── text_style.py   # Style extraction
│       ├── font.py         # Font mapping
│       ├── translator.py   # Image text translation
│       ├── image_utils.py  # Image loading/manipulation
│       ├── slides.py       # Banner slide fetching
│       ├── renderer.py     # SVG rendering
│       └── pipeline.py     # Main translation pipeline
│
├── tests/
│   ├── test_api.py
│   ├── test_cache.py
│   ├── test_scraper.py
│   ├── test_translator.py
│   ├── test_banner_*.py    # Banner module tests
│   └── conftest.py
│
├── pyproject.toml
├── wrangler.toml
└── README.md
```

## Banner Translation Usage

```python
from openai import OpenAI
from src.banner import BannerTranslator

client = OpenAI()
translator = BannerTranslator(client)

# Translate a single banner image
svg = await translator.translate_image_url("https://hiroba.dqx.jp/...")

# Translate all current rotation banners
results = await translator.translate_all_banners()
for slide, svg in results:
    print(f"Translated: {slide.alt}")
```

## License

MIT
