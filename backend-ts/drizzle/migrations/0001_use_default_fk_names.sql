ALTER TABLE `comments` DROP FOREIGN KEY `fk_comments_publication`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `fk_comments_user`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `fk_comments_version`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_ibfk_1`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_ibfk_2`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_ibfk_3`;
--> statement-breakpoint
ALTER TABLE `contributors` DROP FOREIGN KEY `fk_contributors_publication`;
--> statement-breakpoint
ALTER TABLE `contributors` DROP FOREIGN KEY `fk_contributors_user`;
--> statement-breakpoint
ALTER TABLE `linked_assets` DROP FOREIGN KEY `fk_linked_assets_version`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `fk_notifications_comment`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `fk_notifications_publication`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `fk_notifications_user`;
--> statement-breakpoint
ALTER TABLE `org_publication_map` DROP FOREIGN KEY `fk_org_publication_org`;
--> statement-breakpoint
ALTER TABLE `org_publication_map` DROP FOREIGN KEY `fk_org_publication_publication`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `fk_org_user_org`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `fk_org_user_user`;
--> statement-breakpoint
ALTER TABLE `publication_tags` DROP FOREIGN KEY `fk_publication_tags_publication`;
--> statement-breakpoint
ALTER TABLE `publications` DROP FOREIGN KEY `publications_ibfk_1`;
--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP FOREIGN KEY `user_notification_settings_ibfk_1`;
--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP FOREIGN KEY `user_notification_settings_ibfk_2`;
--> statement-breakpoint
ALTER TABLE `version_references` DROP FOREIGN KEY `fk_version_references_version`;
--> statement-breakpoint
ALTER TABLE `version_references` DROP FOREIGN KEY `version_references_ibfk_2`;
--> statement-breakpoint
ALTER TABLE `versions` DROP FOREIGN KEY `versions_ibfk_1`;
--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `approved` tinyint;--> statement-breakpoint
ALTER TABLE `contributors` MODIFY COLUMN `in_byline` tinyint;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `seen` tinyint;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `doi_minting_enabled` tinyint;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `unlisted` tinyint;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `approved` tinyint;--> statement-breakpoint
ALTER TABLE `user_notification_settings` MODIFY COLUMN `is_subscribed` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `approved` tinyint;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_affiliated_org_id_organizations_id_fk` FOREIGN KEY (`affiliated_org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `linked_assets` ADD CONSTRAINT `linked_assets_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_comment_id_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publication_tags` ADD CONSTRAINT `publication_tags_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `user_notification_settings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `uns_nti_notification_types_id_fk` FOREIGN KEY (`notification_type_id`) REFERENCES `notification_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_reference_id_references_id_fk` FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;