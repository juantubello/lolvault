CREATE TABLE `draft_champion_scaling` (
	`champion_key` integer NOT NULL,
	`role` text NOT NULL,
	`bucket` integer NOT NULL,
	`games` integer NOT NULL,
	`wins` integer NOT NULL,
	PRIMARY KEY(`champion_key`, `role`, `bucket`),
	CONSTRAINT "draft_champion_scaling_bucket_check" CHECK("draft_champion_scaling"."bucket" >= 1 AND "draft_champion_scaling"."bucket" <= 7),
	CONSTRAINT "draft_champion_scaling_games_check" CHECK("draft_champion_scaling"."games" >= 0),
	CONSTRAINT "draft_champion_scaling_wins_check" CHECK("draft_champion_scaling"."wins" >= 0 AND "draft_champion_scaling"."wins" <= "draft_champion_scaling"."games")
);
--> statement-breakpoint
CREATE TABLE `draft_scaling_sync_runs` (
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
	CONSTRAINT "draft_scaling_sync_runs_requests_check" CHECK("draft_scaling_sync_runs"."requests_made" >= 0),
	CONSTRAINT "draft_scaling_sync_runs_cursor_check" CHECK("draft_scaling_sync_runs"."next_request_index" >= 0 AND "draft_scaling_sync_runs"."next_request_index" <= "draft_scaling_sync_runs"."total_requests")
);
