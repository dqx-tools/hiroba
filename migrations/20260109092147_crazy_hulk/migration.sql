CREATE TABLE `news_items` (
	`id` text PRIMARY KEY,
	`title_ja` text NOT NULL,
	`category` text NOT NULL,
	`published_at` integer NOT NULL,
	`list_checked_at` integer NOT NULL,
	`content_ja` text,
	`source_updated_at` integer,
	`body_fetched_at` integer,
	`body_fetching_since` integer
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`language` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`translated_at` integer NOT NULL,
	`translating_since` integer,
	CONSTRAINT `translations_pk` PRIMARY KEY(`item_type`, `item_id`, `language`)
);
--> statement-breakpoint
CREATE TABLE `glossary` (
	`source_text` text NOT NULL,
	`target_language` text NOT NULL,
	`translated_text` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `glossary_pk` PRIMARY KEY(`source_text`, `target_language`)
);
