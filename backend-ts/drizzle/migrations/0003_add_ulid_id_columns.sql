ALTER TABLE `comments` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `followers` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `notification_types` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `notifications` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `org_followers` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `organizations` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `publications` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `references` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `temp_links` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `users` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `version_references` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `versions` ADD `id_ulid` varchar(26) AFTER `id`;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `notification_types` ADD CONSTRAINT `notification_types_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `references` ADD CONSTRAINT `references_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `temp_links` ADD CONSTRAINT `temp_links_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `user_notification_settings_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_id_ulid_unique` UNIQUE(`id_ulid`);--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_leader_id_users_id_fk` FOREIGN KEY (`leader_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_follower_id_users_id_fk` FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_follower_id_users_id_fk` FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `temp_links` ADD CONSTRAINT `temp_links_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Backfill ULID-based IDs for existing rows
UPDATE `users` 
    SET `id_ulid` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3)))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `publications`
    SET `id_ulid` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3)))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `versions`
    SET `id_ulid` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3)))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `contributor_affiliations`
    SET `id_ulid` = ULID_FROM_DATETIME(NOW(3))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `organizations`
    SET `id_ulid` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3)))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `comments`
    SET `id_ulid` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3)))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `references`
    SET `id_ulid` = ULID_FROM_DATETIME(updated_at)
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `version_references`
    SET `id_ulid` = ULID_FROM_DATETIME(NOW(3))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `notifications`
    SET `id_ulid` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3)))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `notification_types`
    SET `id_ulid` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3)))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `user_notification_settings`
    SET `id_ulid` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3)))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `temp_links`
    SET `id_ulid` = ULID_FROM_DATETIME(COALESCE(created_at, NOW(3)))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `followers`
    SET `id_ulid` = ULID_FROM_DATETIME(NOW(3))
    WHERE `id_ulid` IS NULL;--> statement-breakpoint
UPDATE `org_followers`
    SET `id_ulid` = ULID_FROM_DATETIME(NOW(3))
    WHERE `id_ulid` IS NULL;
