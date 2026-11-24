ALTER TABLE `comments` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `followers` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `notification_types` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `notifications` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `org_followers` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `organizations` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `publications` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `references` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `temp_links` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `users` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `version_references` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `versions` RENAME COLUMN `id` TO `id_int`;--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `comments_publication_id_publications_id_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `comments_version_id_versions_id_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `comments_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `fk_comments_parent`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_version_id_versions_id_fk`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_affiliated_org_id_organizations_id_fk`;
--> statement-breakpoint
ALTER TABLE `contributors` DROP FOREIGN KEY `contributors_publication_id_publications_id_fk`;
--> statement-breakpoint
ALTER TABLE `contributors` DROP FOREIGN KEY `contributors_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `followers` DROP FOREIGN KEY `followers_leader_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `followers` DROP FOREIGN KEY `followers_follower_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `linked_assets` DROP FOREIGN KEY `linked_assets_version_id_versions_id_fk`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_publication_id_publications_id_fk`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_comment_id_comments_id_fk`;
--> statement-breakpoint
ALTER TABLE `org_followers` DROP FOREIGN KEY `org_followers_org_id_organizations_id_fk`;
--> statement-breakpoint
ALTER TABLE `org_followers` DROP FOREIGN KEY `org_followers_follower_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `org_publication_map` DROP FOREIGN KEY `org_publication_map_org_id_organizations_id_fk`;
--> statement-breakpoint
ALTER TABLE `org_publication_map` DROP FOREIGN KEY `org_publication_map_publication_id_publications_id_fk`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `org_user_map_org_id_organizations_id_fk`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `org_user_map_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `publication_tags` DROP FOREIGN KEY `publication_tags_publication_id_publications_id_fk`;
--> statement-breakpoint
ALTER TABLE `publications` DROP FOREIGN KEY `publications_owner_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `temp_links` DROP FOREIGN KEY `temp_links_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP FOREIGN KEY `user_notification_settings_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP FOREIGN KEY `uns_nti_notification_types_id_fk`;
--> statement-breakpoint
ALTER TABLE `version_references` DROP FOREIGN KEY `version_references_version_id_versions_id_fk`;
--> statement-breakpoint
ALTER TABLE `version_references` DROP FOREIGN KEY `version_references_reference_id_references_id_fk`;
--> statement-breakpoint
ALTER TABLE `versions` DROP FOREIGN KEY `versions_publication_id_publications_id_fk`;
--> statement-breakpoint

--
-- We need to remove Auto Increment before we can remove Primary Key
--
ALTER TABLE `comments` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `comments` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `contributor_affiliations` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `contributor_affiliations` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `followers` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `followers` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `followers` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `followers` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `notification_types` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_types` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `notification_types` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `notification_types` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `notifications` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `notifications` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `org_followers` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `org_followers` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `org_followers` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `org_followers` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `organizations` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `organizations` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `publications` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `publications` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `publications` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `publications` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `references` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `references` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `references` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `references` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `temp_links` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `temp_links` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `temp_links` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `temp_links` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `user_notification_settings` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `user_notification_settings` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `user_notification_settings` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `users` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `version_references` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `version_references` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `version_references` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `version_references` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

ALTER TABLE `versions` MODIFY COLUMN `id_int` int NOT NULL;--> statement-breakpoint
ALTER TABLE `versions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `versions` ADD PRIMARY KEY(`id_int`);--> statement-breakpoint
ALTER TABLE `versions` MODIFY COLUMN `id_int` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint

--
-- Fix constraints
--
ALTER TABLE `comments` ADD CONSTRAINT `comments_publication_id_publications_id_int_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_version_id_versions_id_int_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_user_id_users_id_int_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `fk_comments_parent` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id_int`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_version_id_versions_id_int_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_user_id_users_id_int_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `ca_affiliated_org_id_int_organizations_id_int_fk` FOREIGN KEY (`affiliated_org_id`) REFERENCES `organizations`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_publication_id_publications_id_int_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_user_id_users_id_int_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_leader_id_users_id_int_fk` FOREIGN KEY (`leader_id`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_follower_id_users_id_int_fk` FOREIGN KEY (`follower_id`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `linked_assets` ADD CONSTRAINT `linked_assets_version_id_versions_id_int_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_int_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_publication_id_publications_id_int_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_comment_id_comments_id_int_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_org_id_organizations_id_int_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_follower_id_users_id_int_fk` FOREIGN KEY (`follower_id`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_org_id_organizations_id_int_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_publication_id_publications_id_int_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_org_id_organizations_id_int_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_user_id_users_id_int_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publication_tags` ADD CONSTRAINT `publication_tags_publication_id_publications_id_int_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_owner_id_users_id_int_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `temp_links` ADD CONSTRAINT `temp_links_user_id_users_id_int_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `user_notification_settings_user_id_users_id_int_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `uns_nti_notification_types_id_fk` FOREIGN KEY (`notification_type_id`) REFERENCES `notification_types`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_version_id_versions_id_int_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_reference_id_references_id_int_fk` FOREIGN KEY (`reference_id`) REFERENCES `references`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_publication_id_publications_id_int_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE `publications` DROP FOREIGN KEY `publications_owner_id_ulid_users_id_ulid_fk`;
--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_owner_id_ulid_users_id_ulid_fk` FOREIGN KEY (`owner_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE restrict ON UPDATE no action;