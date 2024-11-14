CREATE TABLE `alliances` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ticker` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`corporation_id` integer NOT NULL,
	`alliance_id` integer,
	`last_seen` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`corporation_id`) REFERENCES `corporations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`alliance_id`) REFERENCES `alliances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `corporations` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ticker` text NOT NULL,
	`alliance_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`alliance_id`) REFERENCES `alliances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scan_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`public` integer DEFAULT 0 NOT NULL,
	`system` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`scan_group_id` text NOT NULL,
	`scan_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`scan_group_id`) REFERENCES `scan_groups`(`id`) ON UPDATE no action ON DELETE no action
);
