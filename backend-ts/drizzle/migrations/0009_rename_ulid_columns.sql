ALTER TABLE `comments` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `comments` RENAME COLUMN `publication_id_ulid` TO `publication_id`;--> statement-breakpoint
ALTER TABLE `comments` RENAME COLUMN `version_id_ulid` TO `version_id`;--> statement-breakpoint
ALTER TABLE `comments` RENAME COLUMN `user_id_ulid` TO `user_id`;--> statement-breakpoint
ALTER TABLE `comments` RENAME COLUMN `parent_id_ulid` TO `parent_id`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME COLUMN `version_id_ulid` TO `version_id`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME COLUMN `user_id_ulid` TO `user_id`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME COLUMN `affiliated_org_id_ulid` TO `affiliated_org_id`;--> statement-breakpoint
ALTER TABLE `contributors` RENAME COLUMN `publication_id_ulid` TO `publication_id`;--> statement-breakpoint
ALTER TABLE `contributors` RENAME COLUMN `user_id_ulid` TO `user_id`;--> statement-breakpoint
ALTER TABLE `followers` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `followers` RENAME COLUMN `leader_id_ulid` TO `leader_id`;--> statement-breakpoint
ALTER TABLE `followers` RENAME COLUMN `follower_id_ulid` TO `follower_id`;--> statement-breakpoint
ALTER TABLE `notification_types` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `notifications` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `notifications` RENAME COLUMN `user_id_ulid` TO `user_id`;--> statement-breakpoint
ALTER TABLE `notifications` RENAME COLUMN `publication_id_ulid` TO `publication_id`;--> statement-breakpoint
ALTER TABLE `notifications` RENAME COLUMN `comment_id_ulid` TO `comment_id`;--> statement-breakpoint
ALTER TABLE `org_followers` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `org_followers` RENAME COLUMN `org_id_ulid` TO `org_id`;--> statement-breakpoint
ALTER TABLE `org_followers` RENAME COLUMN `follower_id_ulid` TO `follower_id`;--> statement-breakpoint
ALTER TABLE `org_publication_map` RENAME COLUMN `org_id_ulid` TO `org_id`;--> statement-breakpoint
ALTER TABLE `org_publication_map` RENAME COLUMN `publication_id_ulid` TO `publication_id`;--> statement-breakpoint
ALTER TABLE `org_user_map` RENAME COLUMN `org_id_ulid` TO `org_id`;--> statement-breakpoint
ALTER TABLE `org_user_map` RENAME COLUMN `user_id_ulid` TO `user_id`;--> statement-breakpoint
ALTER TABLE `organizations` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `publication_tags` RENAME COLUMN `publication_id_ulid` TO `publication_id`;--> statement-breakpoint
ALTER TABLE `publications` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `publications` RENAME COLUMN `owner_id_ulid` TO `owner_id`;--> statement-breakpoint
ALTER TABLE `references` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `temp_links` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `temp_links` RENAME COLUMN `user_id_ulid` TO `user_id`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` RENAME COLUMN `user_id_ulid` TO `user_id`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` RENAME COLUMN `notification_type_id_ulid` TO `notification_type_id`;--> statement-breakpoint
ALTER TABLE `users` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `version_references` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `version_references` RENAME COLUMN `version_id_ulid` TO `version_id`;--> statement-breakpoint
ALTER TABLE `version_references` RENAME COLUMN `reference_id_ulid` TO `reference_id`;--> statement-breakpoint
ALTER TABLE `versions` RENAME COLUMN `id_ulid` TO `id`;--> statement-breakpoint
ALTER TABLE `versions` RENAME COLUMN `publication_id_ulid` TO `publication_id`;--> statement-breakpoint

ALTER TABLE `comments` RENAME INDEX `comments_id_ulid_unique` TO `comments_id_unique`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME INDEX `contributor_affiliations_id_ulid_unique` TO `contributor_affiliations_id_unique`;--> statement-breakpoint
ALTER TABLE `followers` RENAME INDEX `followers_id_ulid_unique` TO `followers_id_unique`;--> statement-breakpoint
ALTER TABLE `notification_types` RENAME INDEX `notification_types_id_ulid_unique` TO `notification_types_id_unique`;--> statement-breakpoint
ALTER TABLE `notifications` RENAME INDEX `notifications_id_ulid_unique` TO `notifications_id_unique`;--> statement-breakpoint
ALTER TABLE `org_followers` RENAME INDEX `org_followers_id_ulid_unique` TO `org_followers_id_unique`;--> statement-breakpoint
ALTER TABLE `organizations` RENAME INDEX `organizations_id_ulid_unique` TO `organizations_id_unique`;--> statement-breakpoint
ALTER TABLE `publications` RENAME INDEX `publications_id_ulid_unique` TO `publications_id_unique`;--> statement-breakpoint
ALTER TABLE `references` RENAME INDEX `references_id_ulid_unique` TO `references_id_unique`;--> statement-breakpoint
ALTER TABLE `temp_links` RENAME INDEX `temp_links_id_ulid_unique` TO `temp_links_id_unique`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` RENAME INDEX `user_notification_settings_id_ulid_unique` TO `user_notification_settings_id_unique`;--> statement-breakpoint
ALTER TABLE `users` RENAME INDEX `users_id_ulid_unique` TO `users_id_unique`;--> statement-breakpoint
ALTER TABLE `version_references` RENAME INDEX `version_references_id_ulid_unique` TO `version_references_id_unique`;--> statement-breakpoint
ALTER TABLE `versions` RENAME INDEX `versions_id_ulid_unique` TO `versions_id_unique`;--> statement-breakpoint

ALTER TABLE `comments` DROP FOREIGN KEY `comments_publication_id_ulid_publications_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `comments_version_id_ulid_versions_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `comments_user_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `fk_comments_parent_ulid`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `fk_comments_parent`;
--> statement-breakpoint
ALTER TABLE `comments` DROP INDEX `fk_comments_parent`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_version_id_ulid_versions_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_user_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `ca_affiliated_org_id_ulid_organizations_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `contributors` DROP FOREIGN KEY `contributors_publication_id_ulid_publications_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `contributors` DROP FOREIGN KEY `contributors_user_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `followers` DROP FOREIGN KEY `followers_leader_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `followers` DROP FOREIGN KEY `followers_follower_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_user_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_publication_id_ulid_publications_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_comment_id_ulid_comments_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `org_followers` DROP FOREIGN KEY `org_followers_org_id_ulid_organizations_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `org_followers` DROP FOREIGN KEY `org_followers_follower_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `org_publication_map` DROP FOREIGN KEY `org_publication_map_org_id_ulid_organizations_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `org_publication_map` DROP FOREIGN KEY `org_publication_map_publication_id_ulid_publications_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `org_user_map_org_id_ulid_organizations_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `org_user_map_user_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `publication_tags` DROP FOREIGN KEY `publication_tags_publication_id_ulid_publications_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `publications` DROP FOREIGN KEY `publications_owner_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `temp_links` DROP FOREIGN KEY `temp_links_user_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP FOREIGN KEY `user_notification_settings_user_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP FOREIGN KEY `uns_nti_notification_types_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP FOREIGN KEY `uns_nti_notification_types_id_fk`;
--> statement-breakpoint
ALTER TABLE `version_references` DROP FOREIGN KEY `version_references_version_id_ulid_versions_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `version_references` DROP FOREIGN KEY `version_references_reference_id_ulid_references_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `versions` DROP FOREIGN KEY `versions_publication_id_ulid_publications_id_ulid_fk`;
--> statement-breakpoint

ALTER TABLE `comments` ADD CONSTRAINT `comments_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `fk_comments_parent_int` FOREIGN KEY (`parent_id_int`) REFERENCES `comments`(`id_int`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT  `fk_comments_parent` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `ca_affiliated_org_id_organizations_id_fk` FOREIGN KEY (`affiliated_org_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_leader_id_users_id_fk` FOREIGN KEY (`leader_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_follower_id_users_id_fk` FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_comment_id_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_follower_id_users_id_fk` FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publication_tags` ADD CONSTRAINT `publication_tags_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `temp_links` ADD CONSTRAINT `temp_links_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `user_notification_settings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `uns_nti_notification_types_id_int_fk` FOREIGN KEY (`notification_type_id_int`) REFERENCES `notification_types`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `uns_nti_notification_types_id_fk` FOREIGN KEY (`notification_type_id`) REFERENCES `notification_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_reference_id_references_id_fk` FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE restrict ON UPDATE no action;