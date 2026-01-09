CREATE TABLE IF NOT EXISTS news_items (
    id TEXT PRIMARY KEY,
    title_ja TEXT NOT NULL,
    content_ja TEXT NOT NULL,
    category TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    date TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_news_item_category ON news_items(category);
CREATE INDEX IF NOT EXISTS idx_news_item_date ON news_items(date DESC);
