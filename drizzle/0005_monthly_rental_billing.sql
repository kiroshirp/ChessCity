CREATE TABLE `rental_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`blocked` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rental_invoices_subscription` ON `rental_invoices` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `rental_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`checkout_id` text NOT NULL,
	`expansion_id` text NOT NULL,
	`player_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`observed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rental_subscriptions_checkout_id_unique` ON `rental_subscriptions` (`checkout_id`);