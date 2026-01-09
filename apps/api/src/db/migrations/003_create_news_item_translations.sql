CREATE TABLE IF NOT EXISTS news_item_translations (
    news_item_id TEXT NOT NULL,
    language TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    locked_at TEXT,
    PRIMARY KEY (news_item_id, language)
) STRICT;
