ALTER TABLE `comments` MODIFY COLUMN `created_at` datetime(3) DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `updated_at` datetime(3);--> statement-breakpoint
ALTER TABLE `notification_types` MODIFY COLUMN `created_at` datetime(3) DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `notification_types` MODIFY COLUMN `updated_at` datetime(3) DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `created_at` datetime(3) DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `org_user_map` MODIFY COLUMN `start_at` datetime(3);--> statement-breakpoint
ALTER TABLE `org_user_map` MODIFY COLUMN `end_at` datetime(3);--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `created_at` datetime(3) DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `updated_at` datetime(3);--> statement-breakpoint
ALTER TABLE `publications` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `publications` MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `publications` MODIFY COLUMN `deleted_at` datetime(3);--> statement-breakpoint
ALTER TABLE `references` MODIFY COLUMN `updated_at` datetime(3);--> statement-breakpoint
ALTER TABLE `temp_links` MODIFY COLUMN `created_at` datetime(3) DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `user_notification_settings` MODIFY COLUMN `created_at` datetime(3) DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `user_notification_settings` MODIFY COLUMN `updated_at` datetime(3) DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `login_at` datetime(3);--> statement-breakpoint
ALTER TABLE `versions` MODIFY COLUMN `import_document_sync_date` datetime(3);--> statement-breakpoint
ALTER TABLE `versions` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT (NOW(3));--> statement-breakpoint
ALTER TABLE `versions` MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT (NOW(3));