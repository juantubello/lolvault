CREATE TABLE `match_details` (
	`provider` text NOT NULL,
	`match_id` text NOT NULL,
	`played_at` integer NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `match_id`)
);
--> statement-breakpoint
CREATE TABLE `player_matches` (
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`match_id` text NOT NULL,
	`puuid` text NOT NULL,
	`played_at` integer NOT NULL,
	`queue` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`champion_id` integer NOT NULL,
	`champion_name` text NOT NULL,
	`position` text,
	`team_key` text NOT NULL,
	`kills` integer NOT NULL,
	`deaths` integer NOT NULL,
	`assists` integer NOT NULL,
	`champion_level` integer NOT NULL,
	`cs` integer NOT NULL,
	`damage_dealt` integer NOT NULL,
	`damage_taken` integer NOT NULL,
	`team_kills` integer NOT NULL,
	`win` integer NOT NULL,
	`result` text NOT NULL,
	`op_score` real,
	`op_score_rank` integer,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `provider`, `match_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `player_matches_user_played_idx` ON `player_matches` (`user_id`,`played_at`);--> statement-breakpoint
CREATE TABLE `player_stats_sync` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`riot_game_name` text NOT NULL,
	`riot_tag_line` text NOT NULL,
	`puuid` text,
	`profile` text,
	`matches_synced_at` integer,
	`profile_synced_at` integer,
	`attempted_at` integer,
	`last_error` text,
	`last_error_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `vault_proposals` ADD `match_provider` text;--> statement-breakpoint
ALTER TABLE `vault_proposals` ADD `match_id` text;--> statement-breakpoint
ALTER TABLE `vault_proposals` ADD `match_snapshot` text;