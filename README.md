# DQX Tools - Dragon Quest X Translation Services

A monorepo containing translation services for Dragon Quest X content from hiroba.dqx.jp.

## Project Structure

This is a monorepo with multiple self-contained Cloudflare Workers:

```
├── workers/
│   ├── news/                  # News Translation API Worker
│   │   ├── pyproject.toml     # Worker-specific dependencies
│   │   ├── wrangler.jsonc     # Worker configuration
│   │   ├── worker.py          # Cloudflare Workers entry point
│   │   └── src/
│   │       └── dqx_news/      # News translation source code
│   │           ├── api.py     # FastAPI application
│   │           ├── cache.py   # D1 caching layer
│   │           ├── scraper.py # News page scraper
│   │           └── translator.py # LangChain translation
│   │
│   └── banner/                # Banner Translation API Worker
│       ├── pyproject.toml     # Worker-specific dependencies
│       ├── wrangler.jsonc     # Worker configuration
│       ├── worker.py          # Cloudflare Workers entry point
│       └── src/
│           └── banner/        # Banner translation source code
│               ├── models.py  # Data models (Point, BoundingBox, etc.)
│               ├── ocr.py     # Google Cloud Vision OCR
│               ├── bounding_boxes.py  # Box merging algorithms
│               ├── inpaint.py # Text region inpainting
│               ├── text_style.py # Style extraction
│               ├── font.py    # Font mapping
│               ├── translator.py # Image text translation
│               ├── image_utils.py # Image loading/manipulation
│               ├── slides.py  # Banner slide fetching
│               ├── renderer.py # SVG rendering
│               └── pipeline.py # Main translation pipeline
│
├── tests/                     # Shared test suite
├── pyproject.toml             # Root config (dev tools only)
└── README.md
```

## Features

### News Translation API (`workers/news`)

- Extracts news listings from all 4 categories:
  - News (ニュース)
  - Events (イベント)
  - Updates (アップデート)
  - Maintenance (メンテナンス/障害)
- Translates Japanese content to English using LangChain + OpenAI
- Caches translations in Cloudflare D1 for fast responses
- RESTful API with pagination support
- Hourly cron job to refresh news automatically

### Banner Translation API (`workers/banner`)

- Extracts rotation banner images from hiroba.dqx.jp
- OCR text detection using Google Cloud Vision
- Intelligent bounding box merging for multi-character text
- Text inpainting to remove original Japanese text
- Style extraction (colors, font weight) from text regions
- SVG rendering with translated text overlay

## API Endpoints

### News API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and available endpoints |
| `/categories` | GET | List all news categories |
| `/news` | GET | Get translated news listings |
| `/news/{id}` | GET | Get translated news detail |
| `/refresh` | POST | Force refresh news from source |
| `/health` | GET | Health check |

#### Query Parameters

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

### Development

Each worker is self-contained with its own dependencies. To work on a specific worker:

```bash
# Navigate to the worker directory
cd workers/news  # or workers/banner

# Install dependencies
uv sync

# Run local development server
npx wrangler dev
```

### Configure Cloudflare

1. Create D1 database (for news worker):
```bash
cd workers/news
wrangler d1 create dqx-news-cache
```

2. Update `wrangler.jsonc` with your D1 database ID

3. Set OpenAI API key:
```bash
wrangler secret put OPENAI_API_KEY
```

### Deploy

Deploy each worker from its directory:

```bash
# Deploy news worker
cd workers/news
npx wrangler deploy

# Deploy banner worker
cd workers/banner
npx wrangler deploy
```

## Running Tests

Tests are run from the project root:

```bash
# Install dev dependencies at root
uv sync --extra dev

# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov --cov-report=html

# Run specific test file
uv run pytest tests/test_scraper.py -v
```

## Worker Dependencies

Each worker has its own minimal `pyproject.toml` with only the dependencies it needs:

### News Worker Dependencies
- beautifulsoup4 - Web scraping
- fastapi - API framework
- httpx - HTTP client
- langchain-core - LLM orchestration
- langchain-openai - OpenAI integration
- pydantic - Data validation

### Banner Worker Dependencies
- google-cloud-vision - OCR
- httpx - HTTP client
- matplotlib - Image visualization
- numpy - Numerical computing
- openai - OpenAI API
- opencv-python - Image processing
- pillow - Image manipulation
- pydantic - Data validation
- scikit-learn - Machine learning (color clustering)
- shapely - Geometric operations
- textdistance - Text similarity

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
