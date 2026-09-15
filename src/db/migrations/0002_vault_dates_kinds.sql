PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vault_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text DEFAULT 'vault' NOT NULL,
	`vault_id` integer,
	`target_user_id` integer NOT NULL,
	`proposer_user_id` integer NOT NULL,
	`champion_id` text NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`reason` text,
	`created_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`approved_at` integer,
	`rejected_at` integer,
	`cancelled_at` integer,
	`lifted_at` integer,
	FOREIGN KEY (`vault_id`) REFERENCES `vault_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`champion_id`) REFERENCES `champions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vault_proposals_kind_check" CHECK("__new_vault_proposals"."kind" IN ('vault', 'lift')),
	CONSTRAINT "vault_proposals_shape_check" CHECK(("__new_vault_proposals"."kind" = 'vault' AND "__new_vault_proposals"."vault_id" IS NULL AND "__new_vault_proposals"."starts_at" IS NOT NULL AND "__new_vault_proposals"."ends_at" IS NOT NULL AND "__new_vault_proposals"."ends_at" > "__new_vault_proposals"."starts_at") OR ("__new_vault_proposals"."kind" = 'lift' AND "__new_vault_proposals"."vault_id" IS NOT NULL AND "__new_vault_proposals"."starts_at" IS NULL AND "__new_vault_proposals"."ends_at" IS NULL AND "__new_vault_proposals"."lifted_at" IS NULL))
);
--> statement-breakpoint
-- Editado a mano: drizzle-kit generaba el SELECT con columnas que la tabla vieja todavía no tiene
-- (kind, starts_at, ...) y la migration fallaba siempre. Solo se copian las columnas existentes.
-- La tabla está vacía en todos los entornos (no hubo deploy), así que el CHECK de forma no rompe.
INSERT INTO `__new_vault_proposals`("id", "target_user_id", "proposer_user_id", "champion_id", "reason", "created_at", "closes_at", "approved_at", "cancelled_at") SELECT "id", "target_user_id", "proposer_user_id", "champion_id", "reason", "created_at", "closes_at", "approved_at", "cancelled_at" FROM `vault_proposals`;--> statement-breakpoint
DROP TABLE `vault_proposals`;--> statement-breakpoint
ALTER TABLE `__new_vault_proposals` RENAME TO `vault_proposals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `vault_proposals_target_champion_idx` ON `vault_proposals` (`target_user_id`,`champion_id`);--> statement-breakpoint
CREATE INDEX `vault_proposals_vault_idx` ON `vault_proposals` (`vault_id`);