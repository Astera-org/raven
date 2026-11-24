ALTER TABLE `notifications` ADD `updated_at` datetime(3) DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `notifications` ADD `deleted_at` datetime;