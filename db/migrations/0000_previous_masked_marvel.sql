CREATE TABLE `import_history` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`imported_at` text NOT NULL,
	`row_count` integer NOT NULL,
	`dedup_skipped` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `raw_trades` (
	`dedup_key` text PRIMARY KEY NOT NULL,
	`exec_time` text NOT NULL,
	`spread` text DEFAULT '' NOT NULL,
	`side` text NOT NULL,
	`qty` integer NOT NULL,
	`pos_effect` text DEFAULT '' NOT NULL,
	`symbol` text NOT NULL,
	`underlying` text NOT NULL,
	`expiration` text DEFAULT '' NOT NULL,
	`strike` real DEFAULT 0 NOT NULL,
	`option_type` text DEFAULT '' NOT NULL,
	`price` real NOT NULL,
	`net_price` real DEFAULT 0 NOT NULL,
	`commission` real DEFAULT 0 NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
