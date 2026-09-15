PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vault_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_user_id` integer NOT NULL,
	`proposer_user_id` integer NOT NULL,
	`champion_id` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`approved_at` integer,
	`cancelled_at` integer,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`champion_id`) REFERENCES `champions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_vault_proposals`("id", "target_user_id", "proposer_user_id", "champion_id", "reason", "created_at", "closes_at", "approved_at", "cancelled_at") SELECT "id", "target_user_id", "proposer_user_id", "champion_id", "reason", "created_at", "closes_at", "approved_at", "cancelled_at" FROM `vault_proposals`;--> statement-breakpoint
DROP TABLE `vault_proposals`;--> statement-breakpoint
ALTER TABLE `__new_vault_proposals` RENAME TO `vault_proposals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;