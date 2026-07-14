ALTER TABLE `trades` ADD `asset_type` text DEFAULT 'OPTION' NOT NULL;--> statement-breakpoint
ALTER TABLE `trades` ADD `open_date` text DEFAULT '' NOT NULL;