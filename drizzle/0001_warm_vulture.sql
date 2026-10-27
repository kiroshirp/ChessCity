CREATE TABLE `communities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`capacity` integer DEFAULT 16 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expansions` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`added_slots` integer DEFAULT 16 NOT NULL,
	`goal_cents` integer DEFAULT 100 NOT NULL,
	`paid_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'awaiting_payment' NOT NULL,
	`created_at` integer NOT NULL,
	`applied_at` integer
);
--> statement-breakpoint
CREATE TABLE `expansion_payments` (
	`event_id` text PRIMARY KEY NOT NULL,
	`expansion_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`refunded_cents` integer DEFAULT 0 NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plots` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`slot` integer NOT NULL,
	`x` integer NOT NULL,
	`z` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plots_community_slot` ON `plots` (`community_id`,`slot`);--> statement-breakpoint
ALTER TABLE `players` ADD `building_xp` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `active_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `rated_baseline` integer;--> statement-breakpoint
ALTER TABLE `players` ADD `progress_day` text;--> statement-breakpoint
ALTER TABLE `players` ADD `daily_games` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `progress_started_at` integer;--> statement-breakpoint
ALTER TABLE `players` ADD `plot_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `players_plot_unique` ON `players` (`plot_id`);