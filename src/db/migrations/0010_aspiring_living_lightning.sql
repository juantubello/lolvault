CREATE TABLE `draft_record_picks` (
	`draft_record_id` integer NOT NULL,
	`side` text NOT NULL,
	`role` text NOT NULL,
	`champion_key` integer NOT NULL,
	PRIMARY KEY(`draft_record_id`, `side`, `role`),
	FOREIGN KEY (`draft_record_id`) REFERENCES `draft_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`champion_key`) REFERENCES `champions`(`key`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "draft_record_picks_side_check" CHECK("draft_record_picks"."side" IN ('allies', 'enemies')),
	CONSTRAINT "draft_record_picks_role_check" CHECK("draft_record_picks"."role" IN ('top', 'jungle', 'middle', 'bottom', 'support'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_record_picks_champion_unique` ON `draft_record_picks` (`draft_record_id`,`champion_key`);--> statement-breakpoint
CREATE TABLE `draft_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`saved_by_user_id` integer NOT NULL,
	`saved_at` integer NOT NULL,
	`predicted_ally_winrate` real NOT NULL,
	`risk` text NOT NULL,
	`patch_window` text NOT NULL,
	`sync_run_id` integer NOT NULL,
	`ally_champion_rating` real NOT NULL,
	`enemy_champion_rating` real NOT NULL,
	`ally_duo_rating` real NOT NULL,
	`enemy_duo_rating` real NOT NULL,
	`matchup_rating` real NOT NULL,
	`total_rating` real NOT NULL,
	`match_provider` text,
	`match_id` text,
	`match_snapshot` text,
	`match_played_at` integer,
	`ally_team_key` text,
	`result` text,
	`saved_after_match` integer,
	`attached_at` integer,
	FOREIGN KEY (`saved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sync_run_id`) REFERENCES `draft_sync_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "draft_records_winrate_check" CHECK("draft_records"."predicted_ally_winrate" >= 0 AND "draft_records"."predicted_ally_winrate" <= 1),
	CONSTRAINT "draft_records_risk_check" CHECK("draft_records"."risk" IN ('very-low', 'low', 'medium', 'high', 'very-high')),
	CONSTRAINT "draft_records_result_check" CHECK("draft_records"."result" IS NULL OR "draft_records"."result" IN ('win', 'lose', 'other')),
	CONSTRAINT "draft_records_attachment_shape_check" CHECK(("draft_records"."match_provider" IS NULL AND "draft_records"."match_id" IS NULL AND "draft_records"."match_snapshot" IS NULL AND "draft_records"."match_played_at" IS NULL AND "draft_records"."ally_team_key" IS NULL AND "draft_records"."result" IS NULL AND "draft_records"."saved_after_match" IS NULL AND "draft_records"."attached_at" IS NULL) OR ("draft_records"."match_provider" IS NOT NULL AND "draft_records"."match_id" IS NOT NULL AND "draft_records"."match_snapshot" IS NOT NULL AND "draft_records"."match_played_at" IS NOT NULL AND "draft_records"."ally_team_key" IS NOT NULL AND "draft_records"."result" IS NOT NULL AND "draft_records"."saved_after_match" IS NOT NULL AND "draft_records"."attached_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `draft_records_saved_at_idx` ON `draft_records` (`saved_at`);--> statement-breakpoint
CREATE INDEX `draft_records_saved_by_idx` ON `draft_records` (`saved_by_user_id`);