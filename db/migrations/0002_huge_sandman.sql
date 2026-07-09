-- NOTE: drizzle also generated "ALTER TABLE trades ADD date" here; removed by hand because the column already exists in the live DB (applied out-of-band before migrations captured it). The 0002 snapshot metadata records it, reconciling the drift.
CREATE TABLE `position_snapshots` (
	`position_key` text NOT NULL,
	`date` text NOT NULL,
	`mark` real NOT NULL,
	`unrealized_pl` real NOT NULL,
	`qty` integer NOT NULL,
	`captured_at` text NOT NULL,
	PRIMARY KEY(`position_key`, `date`)
);
