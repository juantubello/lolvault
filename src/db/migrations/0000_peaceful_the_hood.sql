CREATE TABLE `champions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` integer,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`image_file` text NOT NULL,
	`version` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `champions_key_unique` ON `champions` (`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_identity` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`riot_game_name` text,
	`riot_tag_line` text,
	`riot_puuid` text,
	`avatar_champion_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`avatar_champion_id`) REFERENCES `champions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_identity_unique` ON `users` (`external_identity`);--> statement-breakpoint
CREATE TABLE `vault_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_user_id` integer NOT NULL,
	`proposer_user_id` integer NOT NULL,
	`champion_id` text NOT NULL,
	`days` integer NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`approved_at` integer,
	`vault_ends_at` integer,
	`cancelled_at` integer,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`champion_id`) REFERENCES `champions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vault_proposals_days_check" CHECK("vault_proposals"."days" BETWEEN 1 AND 30),
	CONSTRAINT "vault_proposals_different_users_check" CHECK("vault_proposals"."target_user_id" <> "vault_proposals"."proposer_user_id")
);
--> statement-breakpoint
CREATE TABLE `vault_votes` (
	`proposal_id` integer NOT NULL,
	`voter_user_id` integer NOT NULL,
	`value` text NOT NULL,
	`voted_at` integer NOT NULL,
	PRIMARY KEY(`proposal_id`, `voter_user_id`),
	FOREIGN KEY (`proposal_id`) REFERENCES `vault_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vault_votes_value_check" CHECK("vault_votes"."value" IN ('yes', 'no'))
);
