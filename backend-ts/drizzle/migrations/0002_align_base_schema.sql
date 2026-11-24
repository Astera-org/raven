CREATE TABLE `followers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leader_id` int NOT NULL,
	`follower_id` int NOT NULL,
	CONSTRAINT `followers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `org_followers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`follower_id` int NOT NULL,
	CONSTRAINT `org_followers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notification_types` DROP INDEX `idx_type`;--> statement-breakpoint
ALTER TABLE `publications` DROP INDEX `idx_slug`;--> statement-breakpoint
ALTER TABLE `publications` DROP INDEX `idx_doi`;--> statement-breakpoint
ALTER TABLE `references` DROP INDEX `url`;--> statement-breakpoint
ALTER TABLE `versions` DROP INDEX `idx_version_doi`;--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `approved` boolean;--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `approved` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `state` enum('PUBLISHED','MODERATED','DELETED') NOT NULL DEFAULT 'PUBLISHED';--> statement-breakpoint
ALTER TABLE `contributors` MODIFY COLUMN `in_byline` boolean;--> statement-breakpoint
ALTER TABLE `contributors` MODIFY COLUMN `in_byline` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `state` enum('NEW_PUBLICATION','UPDATED_PUBLICATION','COMMENT','REPLY','MESSAGE') NOT NULL DEFAULT 'NEW_PUBLICATION';--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `slug` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `doi_minting_enabled` boolean;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `doi_minting_enabled` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `unlisted` boolean;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `unlisted` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `approved` boolean;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `approved` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `state` enum('ACTIVE','MODERATED','DELETED') NOT NULL DEFAULT 'ACTIVE';--> statement-breakpoint
ALTER TABLE `user_notification_settings` MODIFY COLUMN `is_subscribed` boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `approved` boolean;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `approved` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `state` enum('ACTIVE','SITE_ADMIN','MODERATED','DELETED') NOT NULL DEFAULT 'ACTIVE';--> statement-breakpoint
ALTER TABLE `temp_links` ADD `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY FIRST;--> statement-breakpoint
ALTER TABLE `notification_types` ADD CONSTRAINT `notification_types_type_unique` UNIQUE(`type`);--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`);--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_slug_unique` UNIQUE(`slug`);--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_doi_unique` UNIQUE(`doi`);--> statement-breakpoint
ALTER TABLE `references` ADD CONSTRAINT `references_url_unique` UNIQUE(`url`);--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_doi_unique` UNIQUE(`doi`);