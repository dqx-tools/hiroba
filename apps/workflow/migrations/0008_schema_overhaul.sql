DROP TABLE IF EXISTS `events`;
DROP TABLE IF EXISTS `translations`;
DROP TABLE IF EXISTS `glossary`;
DROP TABLE IF EXISTS `news_items`;

CREATE TABLE `news_items` (
    `id` text PRIMARY KEY CHECK(length(`id`) = 32),
    `category` text NOT NULL CHECK(`category` IN ('news', 'event', 'update', 'maintenance')),
    `published_at` integer NOT NULL,
    `title_ja` text NOT NULL,
    `content_ja` text,
    `body_fetched_at` integer
) STRICT;

CREATE TABLE `translations` (
    `item_type` text NOT NULL,
    `item_id` text NOT NULL,
    `language` text NOT NULL,
    `field` text NOT NULL,
    `value` text NOT NULL,
    `translated_at` integer NOT NULL,
    `model` text NOT NULL,
    CONSTRAINT `translations_pk` PRIMARY KEY(`item_type`, `item_id`, `language`, `field`)
) STRICT;

CREATE TABLE `glossary` (
    `source_text` text NOT NULL,
    `target_language` text NOT NULL,
    `translated_text` text NOT NULL,
    `updated_at` integer NOT NULL,
    CONSTRAINT `glossary_pk` PRIMARY KEY(`source_text`, `target_language`)
) STRICT;

CREATE TABLE `events` (
    `id` text PRIMARY KEY,
    `type` text NOT NULL CHECK(`type` IN ('multiDay', 'allDay', 'span', 'mark')),
    `title_ja` text NOT NULL,
    `start_time` text NOT NULL,
    `end_time` text CHECK(
        CASE
        WHEN `type` IN ('multiDay', 'span') THEN `end_time` IS NOT NULL
        WHEN `type` IN ('allDay', 'mark') THEN `end_time` IS NULL
        END
    ),
    `source_type` text,
    `source_id` text,
    `created_at` integer NOT NULL
) STRICT;

CREATE INDEX `events_start_time_idx` ON `events` (`start_time`);
CREATE INDEX `events_source_idx` ON `events` (`source_type`, `source_id`);
