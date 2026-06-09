CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`sym` text NOT NULL,
	`strat` text NOT NULL,
	`side` text NOT NULL,
	`qty` integer NOT NULL,
	`strike` text NOT NULL,
	`exp` text NOT NULL,
	`fill` real NOT NULL,
	`comm` real,
	`pl` real NOT NULL,
	`status` text NOT NULL
);
