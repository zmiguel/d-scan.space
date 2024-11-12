CREATE TABLE `alliances` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ticker` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `corporations` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ticker` text NOT NULL,
	`alliance_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`alliance_id`) REFERENCES `alliances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`corporation_id` integer NOT NULL,
	`alliance_id` integer,
	`last_seen` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`corporation_id`) REFERENCES `corporations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`alliance_id`) REFERENCES `alliances`(`id`) ON UPDATE no action ON DELETE no action
);
