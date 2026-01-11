-- Remove unused source_updated_at column (duplicate of published_at)
ALTER TABLE `news_items` DROP COLUMN `source_updated_at`;
