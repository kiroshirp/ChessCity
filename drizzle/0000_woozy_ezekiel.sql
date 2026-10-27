CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`next_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth` (
	`hash` text PRIMARY KEY NOT NULL,
	`verifier` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`profile` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`accent` text DEFAULT 'jade' NOT NULL,
	`roof` text DEFAULT 'antenna' NOT NULL,
	`claimed` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
