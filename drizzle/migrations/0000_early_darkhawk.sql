CREATE TABLE `scan_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`system` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`scan_group_id` text NOT NULL,
	`scan_type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`scan_group_id`) REFERENCES `scan_groups`(`id`) ON UPDATE no action ON DELETE no action
);
