-- Migrate translations to field-based structure
-- Changes: (item_type, item_id, language) -> title, content
-- To: (item_type, item_id, language, field) -> value

-- Step 1: Create new table with field-based schema
CREATE TABLE `translations_new` (
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`language` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`translated_at` integer NOT NULL,
	`model` text,
	`translating_since` integer,
	CONSTRAINT `translations_new_pk` PRIMARY KEY(`item_type`, `item_id`, `language`, `field`)
);

-- Step 2: Migrate existing title fields
INSERT INTO `translations_new` (`item_type`, `item_id`, `language`, `field`, `value`, `translated_at`, `model`, `translating_since`)
SELECT `item_type`, `item_id`, `language`, 'title', `title`, `translated_at`, `model`, `translating_since`
FROM `translations`
WHERE `title` IS NOT NULL AND `title` != '';

-- Step 3: Migrate existing content fields (no lock on content rows)
INSERT INTO `translations_new` (`item_type`, `item_id`, `language`, `field`, `value`, `translated_at`, `model`, `translating_since`)
SELECT `item_type`, `item_id`, `language`, 'content', `content`, `translated_at`, `model`, NULL
FROM `translations`
WHERE `content` IS NOT NULL AND `content` != '';

-- Step 4: Drop old table and rename
DROP TABLE `translations`;
ALTER TABLE `translations_new` RENAME TO `translations`;
