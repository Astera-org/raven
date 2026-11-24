CREATE TABLE `accounts` (
	`id` varchar(26) NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`password` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(26) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` varchar(26) NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` varchar(26) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` RENAME COLUMN `avatar` TO `image`;--> statement-breakpoint
ALTER TABLE `users` RENAME COLUMN `created_at` TO `created_at_str`;--> statement-breakpoint
ALTER TABLE `users` RENAME COLUMN `updated_at` TO `updated_at_str`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `idx_users_clerk_id`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `id` varchar(26);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `username` varchar(255);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `image` text;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `password` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `users` ADD `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `users` ADD `name` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `display_username` text;--> statement-breakpoint

-- Backfill `name` column
UPDATE `users` SET `name` = CONCAT_WS(' ', `first_name`, `last_name`) WHERE `name` = '';--> statement-breakpoint

ALTER TABLE `users` MODIFY COLUMN `email` varchar(255);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `username` varchar(255);--> statement-breakpoint

-- Special cases for us where we have issues with duplicates.
UPDATE `users` SET `email` = NULL WHERE `email` = '';--> statement-breakpoint
UPDATE `users` SET `username` = 'hng_c_2' WHERE `username` = 'hng_c' and id_int = 4700;--> statement-breakpoint
UPDATE `users` SET `username` = 'jc_c_2' WHERE `username` = 'jc_c' and id_int = 4485;--> statement-breakpoint
UPDATE `users` SET `username` = 'jliu_c_2' WHERE `username` = 'jliu_c' and id_int = 4604;--> statement-breakpoint
UPDATE `users` SET `username` = 'jgalazmontoya_c_2' WHERE `username` = 'jgalazmontoya_c' and id_int = 4736;--> statement-breakpoint

ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint

ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verifications` (`identifier`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `google_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `clerk_id`;--> statement-breakpoint
ALTER TABLE `temp_links` MODIFY COLUMN `code` varchar(255) NOT NULL;--> statement-breakpoint

-- Migrate dates to the new `timestamp` columns
UPDATE users SET created_at = COALESCE(created_at_str, NOW(3)), updated_at = COALESCE(updated_at_str, created_at_str, NOW(3));--> statement-breakpoint

-- Delete the old `datetime` columns
ALTER TABLE `users` DROP COLUMN `created_at_str`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `updated_at_str`;--> statement-breakpoint

-- Backfill user accounts for better auth
INSERT INTO accounts (id, account_id, provider_id, user_id, updated_at, password)
SELECT
  ULID(),
  u.id,
  'credential',
  u.id,
  u.created_at,
  u.password
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM accounts a
  WHERE a.user_id = u.id
    AND a.provider_id = 'credential'
    AND u.password is not NULL
    AND u.password != ''
);
