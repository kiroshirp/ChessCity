CREATE TABLE `city_events` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `expansions` ADD `rent_paid_until` integer;--> statement-breakpoint
ALTER TABLE `plots` ADD `rental_expansion_id` text;