CREATE TABLE `draft_champion_stats` (
	`champion_key` integer NOT NULL,
	`role` text NOT NULL,
	`games` integer NOT NULL,
	`wins` integer NOT NULL,
	`patch_window` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`champion_key`, `role`),
	CONSTRAINT "draft_champion_stats_games_check" CHECK("draft_champion_stats"."games" >= 0),
	CONSTRAINT "draft_champion_stats_wins_check" CHECK("draft_champion_stats"."wins" >= 0 AND "draft_champion_stats"."wins" <= "draft_champion_stats"."games")
);
--> statement-breakpoint
CREATE TABLE `draft_matchups` (
	`champion_key` integer NOT NULL,
	`role` text NOT NULL,
	`enemy_champion_key` integer NOT NULL,
	`enemy_role` text NOT NULL,
	`games` integer NOT NULL,
	`wins` integer NOT NULL,
	PRIMARY KEY(`champion_key`, `role`, `enemy_champion_key`, `enemy_role`),
	CONSTRAINT "draft_matchups_games_check" CHECK("draft_matchups"."games" >= 0),
	CONSTRAINT "draft_matchups_wins_check" CHECK("draft_matchups"."wins" >= 0 AND "draft_matchups"."wins" <= "draft_matchups"."games")
);
--> statement-breakpoint
CREATE INDEX `draft_matchups_enemy_idx` ON `draft_matchups` (`enemy_champion_key`,`enemy_role`);--> statement-breakpoint
CREATE TABLE `draft_sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`patch_window` text NOT NULL,
	`requests_made` integer DEFAULT 0 NOT NULL,
	`total_requests` integer NOT NULL,
	`start_request_index` integer DEFAULT 0 NOT NULL,
	`next_request_index` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT false NOT NULL,
	`error` text,
	CONSTRAINT "draft_sync_runs_requests_check" CHECK("draft_sync_runs"."requests_made" >= 0),
	CONSTRAINT "draft_sync_runs_cursor_check" CHECK("draft_sync_runs"."next_request_index" >= 0 AND "draft_sync_runs"."next_request_index" <= "draft_sync_runs"."total_requests")
);
--> statement-breakpoint
CREATE TABLE `draft_synergies` (
	`champion_key` integer NOT NULL,
	`role` text NOT NULL,
	`ally_champion_key` integer NOT NULL,
	`ally_role` text NOT NULL,
	`games` integer NOT NULL,
	`wins` integer NOT NULL,
	PRIMARY KEY(`champion_key`, `role`, `ally_champion_key`, `ally_role`),
	CONSTRAINT "draft_synergies_games_check" CHECK("draft_synergies"."games" >= 0),
	CONSTRAINT "draft_synergies_wins_check" CHECK("draft_synergies"."wins" >= 0 AND "draft_synergies"."wins" <= "draft_synergies"."games")
);
--> statement-breakpoint
CREATE INDEX `draft_synergies_ally_idx` ON `draft_synergies` (`ally_champion_key`,`ally_role`);