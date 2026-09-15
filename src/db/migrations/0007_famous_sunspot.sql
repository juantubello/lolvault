CREATE TABLE `custom_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender_user_id` integer NOT NULL,
	`message` text NOT NULL,
	`local_day` text NOT NULL,
	`sent_at` integer NOT NULL,
	`recipients` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_notifications_sender_day_unique` ON `custom_notifications` (`sender_user_id`,`local_day`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`vaults` integer DEFAULT true NOT NULL,
	`blacklist` integer DEFAULT true NOT NULL,
	`custom` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
