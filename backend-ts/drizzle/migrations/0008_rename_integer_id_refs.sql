ALTER TABLE `comments` RENAME COLUMN `publication_id` TO `publication_id_int`;--> statement-breakpoint
ALTER TABLE `comments` RENAME COLUMN `version_id` TO `version_id_int`;--> statement-breakpoint
ALTER TABLE `comments` RENAME COLUMN `user_id` TO `user_id_int`;--> statement-breakpoint
ALTER TABLE `comments` RENAME COLUMN `parent_id` TO `parent_id_int`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME COLUMN `version_id` TO `version_id_int`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME COLUMN `user_id` TO `user_id_int`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME COLUMN `affiliated_org_id` TO `affiliated_org_id_int`;--> statement-breakpoint
ALTER TABLE `contributors` RENAME COLUMN `publication_id` TO `publication_id_int`;--> statement-breakpoint
ALTER TABLE `contributors` RENAME COLUMN `user_id` TO `user_id_int`;--> statement-breakpoint
ALTER TABLE `followers` RENAME COLUMN `leader_id` TO `leader_id_int`;--> statement-breakpoint
ALTER TABLE `followers` RENAME COLUMN `follower_id` TO `follower_id_int`;--> statement-breakpoint
ALTER TABLE `linked_assets` RENAME COLUMN `version_id` TO `version_id_int`;--> statement-breakpoint
ALTER TABLE `notifications` RENAME COLUMN `user_id` TO `user_id_int`;--> statement-breakpoint
ALTER TABLE `notifications` RENAME COLUMN `publication_id` TO `publication_id_int`;--> statement-breakpoint
ALTER TABLE `notifications` RENAME COLUMN `comment_id` TO `comment_id_int`;--> statement-breakpoint
ALTER TABLE `org_followers` RENAME COLUMN `org_id` TO `org_id_int`;--> statement-breakpoint
ALTER TABLE `org_followers` RENAME COLUMN `follower_id` TO `follower_id_int`;--> statement-breakpoint
ALTER TABLE `org_publication_map` RENAME COLUMN `org_id` TO `org_id_int`;--> statement-breakpoint
ALTER TABLE `org_publication_map` RENAME COLUMN `publication_id` TO `publication_id_int`;--> statement-breakpoint
ALTER TABLE `org_user_map` RENAME COLUMN `org_id` TO `org_id_int`;--> statement-breakpoint
ALTER TABLE `org_user_map` RENAME COLUMN `user_id` TO `user_id_int`;--> statement-breakpoint
ALTER TABLE `publication_tags` RENAME COLUMN `publication_id` TO `publication_id_int`;--> statement-breakpoint
ALTER TABLE `publications` RENAME COLUMN `owner_id` TO `owner_id_int`;--> statement-breakpoint
ALTER TABLE `temp_links` RENAME COLUMN `user_id` TO `user_id_int`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` RENAME COLUMN `user_id` TO `user_id_int`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` RENAME COLUMN `notification_type_id` TO `notification_type_id_int`;--> statement-breakpoint
ALTER TABLE `version_references` RENAME COLUMN `version_id` TO `version_id_int`;--> statement-breakpoint
ALTER TABLE `version_references` RENAME COLUMN `reference_id` TO `reference_id_int`;--> statement-breakpoint
ALTER TABLE `versions` RENAME COLUMN `publication_id` TO `publication_id_int`;--> statement-breakpoint

ALTER TABLE `comments` DROP FOREIGN KEY `comments_publication_id_publications_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `comments_version_id_versions_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `comments_user_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `fk_comments_parent`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_version_id_versions_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_user_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `ca_affiliated_org_id_int_organizations_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `contributors` DROP FOREIGN KEY `contributors_publication_id_publications_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `contributors` DROP FOREIGN KEY `contributors_user_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `followers` DROP FOREIGN KEY `followers_leader_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `followers` DROP FOREIGN KEY `followers_follower_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `linked_assets` DROP FOREIGN KEY `linked_assets_version_id_versions_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_user_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_publication_id_publications_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_comment_id_comments_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `org_followers` DROP FOREIGN KEY `org_followers_org_id_organizations_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `org_followers` DROP FOREIGN KEY `org_followers_follower_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `org_publication_map` DROP FOREIGN KEY `org_publication_map_org_id_organizations_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `org_publication_map` DROP FOREIGN KEY `org_publication_map_publication_id_publications_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `org_user_map_org_id_organizations_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `org_user_map_user_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `publication_tags` DROP FOREIGN KEY `publication_tags_publication_id_publications_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `publications` DROP FOREIGN KEY `publications_owner_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `temp_links` DROP FOREIGN KEY `temp_links_user_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP FOREIGN KEY `user_notification_settings_user_id_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP FOREIGN KEY `uns_nti_notification_types_id_fk`;
--> statement-breakpoint
ALTER TABLE `version_references` DROP FOREIGN KEY `version_references_version_id_versions_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `version_references` DROP FOREIGN KEY `version_references_reference_id_references_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `versions` DROP FOREIGN KEY `versions_publication_id_publications_id_int_fk`;
--> statement-breakpoint

DROP INDEX `idx_publication_state` ON `comments`;--> statement-breakpoint
DROP INDEX `user_id` ON `contributor_affiliations`;--> statement-breakpoint
DROP INDEX `affiliated_org_id` ON `contributor_affiliations`;--> statement-breakpoint
DROP INDEX `idx_publication_id` ON `contributors`;--> statement-breakpoint
DROP INDEX `idx_user_id` ON `contributors`;--> statement-breakpoint
DROP INDEX `idx_publication_id` ON `org_publication_map`;--> statement-breakpoint
DROP INDEX `idx_user_id` ON `org_user_map`;--> statement-breakpoint
DROP INDEX `owner_id` ON `publications`;--> statement-breakpoint
DROP INDEX `notification_type_id` ON `user_notification_settings`;--> statement-breakpoint
DROP INDEX `reference_id` ON `version_references`;--> statement-breakpoint

ALTER TABLE `comments` ADD CONSTRAINT `comments_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_version_id_int_versions_id_int_fk` FOREIGN KEY (`version_id_int`) REFERENCES `versions`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `fk_comments_parent` FOREIGN KEY (`parent_id_int`) REFERENCES `comments`(`id_int`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_version_id_int_versions_id_int_fk` FOREIGN KEY (`version_id_int`) REFERENCES `versions`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `ca_affiliated_org_id_int_organizations_id_int_fk` FOREIGN KEY (`affiliated_org_id_int`) REFERENCES `organizations`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_leader_id_int_users_id_int_fk` FOREIGN KEY (`leader_id_int`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_follower_id_int_users_id_int_fk` FOREIGN KEY (`follower_id_int`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `linked_assets` ADD CONSTRAINT `linked_assets_version_id_int_versions_id_int_fk` FOREIGN KEY (`version_id_int`) REFERENCES `versions`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_comment_id_int_comments_id_int_fk` FOREIGN KEY (`comment_id_int`) REFERENCES `comments`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_org_id_int_organizations_id_int_fk` FOREIGN KEY (`org_id_int`) REFERENCES `organizations`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_follower_id_int_users_id_int_fk` FOREIGN KEY (`follower_id_int`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_org_id_int_organizations_id_int_fk` FOREIGN KEY (`org_id_int`) REFERENCES `organizations`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_org_id_int_organizations_id_int_fk` FOREIGN KEY (`org_id_int`) REFERENCES `organizations`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publication_tags` ADD CONSTRAINT `publication_tags_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_owner_id_int_users_id_int_fk` FOREIGN KEY (`owner_id_int`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `temp_links` ADD CONSTRAINT `temp_links_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `user_notification_settings_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `uns_nti_notification_types_id_fk` FOREIGN KEY (`notification_type_id_int`) REFERENCES `notification_types`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_version_id_int_versions_id_int_fk` FOREIGN KEY (`version_id_int`) REFERENCES `versions`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_reference_id_int_references_id_int_fk` FOREIGN KEY (`reference_id_int`) REFERENCES `references`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_publication_state` ON `comments` (`publication_id_int`,`state`);--> statement-breakpoint
CREATE INDEX `user_id` ON `contributor_affiliations` (`user_id_int`);--> statement-breakpoint
CREATE INDEX `affiliated_org_id` ON `contributor_affiliations` (`affiliated_org_id_int`);--> statement-breakpoint
CREATE INDEX `idx_publication_id` ON `contributors` (`publication_id_int`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `contributors` (`user_id_int`);--> statement-breakpoint
CREATE INDEX `idx_publication_id` ON `org_publication_map` (`publication_id_int`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `org_user_map` (`user_id_int`);--> statement-breakpoint
CREATE INDEX `owner_id` ON `publications` (`owner_id_int`);--> statement-breakpoint
CREATE INDEX `notification_type_id` ON `user_notification_settings` (`notification_type_id_int`);--> statement-breakpoint
CREATE INDEX `reference_id` ON `version_references` (`reference_id_int`);--> statement-breakpoint

-- Rename indexes
ALTER TABLE `linked_assets` RENAME INDEX `version_id` TO `version_id_int`;--> statement-breakpoint
ALTER TABLE `version_references` RENAME INDEX `version_id` TO `version_id_int`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME INDEX `user_id` TO `user_id_int`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME INDEX `affiliated_org_id` TO `affiliated_org_id_int`;--> statement-breakpoint
ALTER TABLE `contributors` RENAME INDEX `idx_publication_id` TO `idx_publication_id_int`;--> statement-breakpoint
ALTER TABLE `contributors` RENAME INDEX `idx_user_id` TO `idx_user_id_int`;--> statement-breakpoint
ALTER TABLE `org_publication_map` RENAME INDEX `idx_publication_id` TO `idx_publication_id_int`;--> statement-breakpoint
ALTER TABLE `org_user_map` RENAME INDEX `idx_user_id` TO `idx_user_id_int`;--> statement-breakpoint
ALTER TABLE `publications` RENAME INDEX `owner_id` TO `owner_id_int`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` RENAME INDEX `notification_type_id` TO `notification_type_id_int`;--> statement-breakpoint
ALTER TABLE `version_references` RENAME INDEX `reference_id` TO `reference_id_int`;