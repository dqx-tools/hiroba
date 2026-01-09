CREATE TABLE IF NOT EXISTS translation_glossary (
    japanese_text TEXT NOT NULL UNIQUE,
    english_text TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_glossary_japanese ON translation_glossary(japanese_text);
