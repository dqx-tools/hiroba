-- Events table for calendar events extracted from news/topics

CREATE TABLE `events` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`title_ja` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text,
	`source_type` text,
	`source_id` text,
	`created_at` integer NOT NULL
);
