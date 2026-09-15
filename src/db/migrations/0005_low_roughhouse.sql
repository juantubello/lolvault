CREATE TABLE `blacklist_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`entry_id` integer,
	`player_name` text NOT NULL,
	`riot_game_name` text,
	`riot_tag_line` text,
	`dedupe_key` text NOT NULL,
	`proposer_user_id` integer NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`approved_at` integer,
	`rejected_at` integer,
	`cancelled_at` integer,
	`removed_at` integer,
	`match_provider` text,
	`match_id` text,
	`match_snapshot` text,
	FOREIGN KEY (`entry_id`) REFERENCES `blacklist_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "blacklist_proposals_kind_check" CHECK("blacklist_proposals"."kind" IN ('add', 'remove')),
	CONSTRAINT "blacklist_proposals_shape_check" CHECK(("blacklist_proposals"."kind" = 'add' AND "blacklist_proposals"."entry_id" IS NULL) OR ("blacklist_proposals"."kind" = 'remove' AND "blacklist_proposals"."entry_id" IS NOT NULL AND "blacklist_proposals"."removed_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `blacklist_proposals_dedupe_idx` ON `blacklist_proposals` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `blacklist_proposals_entry_idx` ON `blacklist_proposals` (`entry_id`);--> statement-breakpoint
CREATE TABLE `blacklist_votes` (
	`proposal_id` integer NOT NULL,
	`voter_user_id` integer NOT NULL,
	`value` text NOT NULL,
	`voted_at` integer NOT NULL,
	PRIMARY KEY(`proposal_id`, `voter_user_id`),
	FOREIGN KEY (`proposal_id`) REFERENCES `blacklist_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "blacklist_votes_value_check" CHECK("blacklist_votes"."value" IN ('yes', 'no'))
);
--> statement-breakpoint
CREATE TABLE `match_participants` (
	`provider` text NOT NULL,
	`match_id` text NOT NULL,
	`puuid` text NOT NULL,
	`game_name` text NOT NULL,
	`tag_line` text NOT NULL,
	`search_name` text NOT NULL,
	`champion_id` integer,
	`champion_name` text,
	`team_key` text,
	`played_at` integer,
	PRIMARY KEY(`provider`, `match_id`, `puuid`)
);
--> statement-breakpoint
CREATE INDEX `match_participants_search_name_idx` ON `match_participants` (`search_name`);--> statement-breakpoint
CREATE INDEX `match_participants_riot_id_idx` ON `match_participants` (`game_name`,`tag_line`);