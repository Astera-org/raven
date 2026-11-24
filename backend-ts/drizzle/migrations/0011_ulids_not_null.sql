UPDATE `users` SET `id` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3))) WHERE `id` IS NULL;--> statement-breakpoint

ALTER TABLE `users` MODIFY COLUMN `id` varchar(26) NOT NULL;