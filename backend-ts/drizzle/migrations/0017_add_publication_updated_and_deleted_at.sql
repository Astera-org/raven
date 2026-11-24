ALTER TABLE `publications` ADD `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP) NOT NULL;--> statement-breakpoint
ALTER TABLE `publications` ADD `deleted_at` datetime;