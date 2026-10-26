CREATE TABLE `expansion_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`expansion_id` text NOT NULL,
	`player_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`session_id` text,
	`checkout_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expansion_checkouts_session_id_unique` ON `expansion_checkouts` (`session_id`);--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_expansions` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`added_slots` integer DEFAULT 4 NOT NULL,
	`goal_cents` integer DEFAULT 100 NOT NULL,
	`paid_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'awaiting_payment' NOT NULL,
	`created_at` integer NOT NULL,
	`applied_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_expansions`("id", "community_id", "added_slots", "goal_cents", "paid_cents", "status", "created_at", "applied_at") SELECT "id", "community_id", "added_slots", "goal_cents", "paid_cents", "status", "created_at", "applied_at" FROM `expansions`;--> statement-breakpoint
DROP TABLE `expansions`;--> statement-breakpoint
ALTER TABLE `__new_expansions` RENAME TO `expansions`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
-- Pending, unfunded requests adopt the new four-plot offer. Paid/applied history remains unchanged.
UPDATE expansions SET added_slots=4 WHERE status='awaiting_payment' AND paid_cents=0;
