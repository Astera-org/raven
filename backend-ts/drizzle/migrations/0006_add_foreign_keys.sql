-- Add ULID columns to all tables that have foreign key relationships
ALTER TABLE `comments` ADD `publication_id_ulid` varchar(26) AFTER `publication_id`;--> statement-breakpoint
ALTER TABLE `comments` ADD `version_id_ulid` varchar(26) AFTER `version_id`;--> statement-breakpoint
ALTER TABLE `comments` ADD `user_id_ulid` varchar(26) AFTER `user_id`;--> statement-breakpoint
ALTER TABLE `comments` ADD `parent_id_ulid` varchar(26) AFTER `parent_id`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD `version_id_ulid` varchar(26) AFTER `version_id`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD `user_id_ulid` varchar(26) AFTER `user_id`;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD `affiliated_org_id_ulid` varchar(26) AFTER `affiliated_org_id`;--> statement-breakpoint
ALTER TABLE `contributors` ADD `publication_id_ulid` varchar(26) AFTER `publication_id`;--> statement-breakpoint
ALTER TABLE `contributors` ADD `user_id_ulid` varchar(26) AFTER `user_id`;--> statement-breakpoint
ALTER TABLE `followers` ADD `leader_id_ulid` varchar(26) AFTER `leader_id`;--> statement-breakpoint
ALTER TABLE `followers` ADD `follower_id_ulid` varchar(26) AFTER `follower_id`;--> statement-breakpoint
ALTER TABLE `notifications` ADD `user_id_ulid` varchar(26) AFTER `user_id`;--> statement-breakpoint
ALTER TABLE `notifications` ADD `publication_id_ulid` varchar(26) AFTER `publication_id`;--> statement-breakpoint
ALTER TABLE `notifications` ADD `comment_id_ulid` varchar(26) AFTER `comment_id`;--> statement-breakpoint
ALTER TABLE `org_followers` ADD `org_id_ulid` varchar(26) AFTER `org_id`;--> statement-breakpoint
ALTER TABLE `org_followers` ADD `follower_id_ulid` varchar(26) AFTER `follower_id`;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD `org_id_ulid` varchar(26) AFTER `org_id`;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD `publication_id_ulid` varchar(26) AFTER `publication_id`;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD `org_id_ulid` varchar(26) AFTER `org_id`;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD `user_id_ulid` varchar(26) AFTER `user_id`;--> statement-breakpoint
ALTER TABLE `publication_tags` ADD `publication_id_ulid` varchar(26) AFTER `publication_id`;--> statement-breakpoint
ALTER TABLE `publications` ADD `owner_id_ulid` varchar(26) AFTER `owner_id`;--> statement-breakpoint
ALTER TABLE `temp_links` ADD `user_id_ulid` varchar(26) AFTER `user_id`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD `user_id_ulid` varchar(26) AFTER `user_id`;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD `notification_type_id_ulid` varchar(26) AFTER `notification_type_id`;--> statement-breakpoint
ALTER TABLE `version_references` ADD `version_id_ulid` varchar(26) AFTER `version_id`;--> statement-breakpoint
ALTER TABLE `version_references` ADD `reference_id_ulid` varchar(26) AFTER `reference_id`;--> statement-breakpoint
ALTER TABLE `versions` ADD `publication_id_ulid` varchar(26) AFTER `publication_id`;--> statement-breakpoint

-- BACKFILL Connections
UPDATE `comments` c JOIN `publications` p ON c.`publication_id` = p.`id` SET c.`publication_id_ulid` = p.`id_ulid` WHERE c.`publication_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `comments` c JOIN `versions` v ON c.`version_id` = v.`id` SET c.`version_id_ulid` = v.`id_ulid` WHERE c.`version_id_ulid` IS NULL AND c.`version_id` IS NOT NULL;--> statement-breakpoint
UPDATE `comments` c JOIN `users` u ON c.`user_id` = u.`id` SET c.`user_id_ulid` = u.`id_ulid` WHERE c.`user_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `comments` c JOIN `comments` p ON c.`parent_id` = p.`id` SET c.`parent_id_ulid` = p.`id_ulid` WHERE c.`parent_id_ulid` IS NULL AND c.`parent_id` IS NOT NULL;--> statement-breakpoint
UPDATE `contributor_affiliations` ca JOIN `versions` v ON ca.`version_id` = v.`id` SET ca.`version_id_ulid` = v.`id_ulid` WHERE ca.`version_id_ulid` IS NULL AND ca.`version_id` IS NOT NULL;--> statement-breakpoint
UPDATE `contributor_affiliations` ca JOIN `users` u ON ca.`user_id` = u.`id` SET ca.`user_id_ulid` = u.`id_ulid` WHERE ca.`user_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `contributor_affiliations` ca JOIN `organizations` o ON ca.`affiliated_org_id` = o.`id` SET ca.`affiliated_org_id_ulid` = o.`id_ulid` WHERE ca.`affiliated_org_id_ulid` IS NULL AND ca.`affiliated_org_id` IS NOT NULL;--> statement-breakpoint
UPDATE `contributors` c JOIN `publications` p ON c.`publication_id` = p.`id` SET c.`publication_id_ulid` = p.`id_ulid` WHERE c.`publication_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `contributors` c JOIN `users` u ON c.`user_id` = u.`id` SET c.`user_id_ulid` = u.`id_ulid` WHERE c.`user_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `followers` f JOIN `users` l ON f.`leader_id` = l.`id` SET f.`leader_id_ulid` = l.`id_ulid` WHERE f.`leader_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `followers` f JOIN `users` u ON f.`follower_id` = u.`id` SET f.`follower_id_ulid` = u.`id_ulid` WHERE f.`follower_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `notifications` n JOIN `users` u ON n.`user_id` = u.`id` SET n.`user_id_ulid` = u.`id_ulid` WHERE n.`user_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `notifications` n JOIN `publications` p ON n.`publication_id` = p.`id` SET n.`publication_id_ulid` = p.`id_ulid` WHERE n.`publication_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `notifications` n JOIN `comments` c ON n.`comment_id` = c.`id` SET n.`comment_id_ulid` = c.`id_ulid` WHERE n.`comment_id_ulid` IS NULL AND n.`comment_id` IS NOT NULL;--> statement-breakpoint
UPDATE `org_followers` org_f JOIN `organizations` o ON org_f.`org_id` = o.`id` SET org_f.`org_id_ulid` = o.`id_ulid` WHERE org_f.`org_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `org_followers` org_f JOIN `users` u ON org_f.`follower_id` = u.`id` SET org_f.`follower_id_ulid` = u.`id_ulid` WHERE org_f.`follower_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `org_publication_map` opm JOIN `organizations` o ON opm.`org_id` = o.`id` SET opm.`org_id_ulid` = o.`id_ulid` WHERE opm.`org_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `org_publication_map` opm JOIN `publications` p ON opm.`publication_id` = p.`id` SET opm.`publication_id_ulid` = p.`id_ulid` WHERE opm.`publication_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `org_user_map` oum JOIN `organizations` o ON oum.`org_id` = o.`id` SET oum.`org_id_ulid` = o.`id_ulid` WHERE oum.`org_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `org_user_map` oum JOIN `users` u ON oum.`user_id` = u.`id` SET oum.`user_id_ulid` = u.`id_ulid` WHERE oum.`user_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `publication_tags` pt JOIN `publications` p ON pt.`publication_id` = p.`id` SET pt.`publication_id_ulid` = p.`id_ulid` WHERE pt.`publication_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `publications` p JOIN `users` u ON p.`owner_id` = u.`id` SET p.`owner_id_ulid` = u.`id_ulid` WHERE p.`owner_id_ulid` IS NULL AND p.`owner_id` IS NOT NULL;--> statement-breakpoint
UPDATE `temp_links` tl JOIN `users` u ON tl.`user_id` = u.`id` SET tl.`user_id_ulid` = u.`id_ulid` WHERE tl.`user_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `user_notification_settings` uns JOIN `users` u ON uns.`user_id` = u.`id` SET uns.`user_id_ulid` = u.`id_ulid` WHERE uns.`user_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `user_notification_settings` uns JOIN `notification_types` nt ON uns.`notification_type_id` = nt.`id` SET uns.`notification_type_id_ulid` = nt.`id_ulid` WHERE uns.`notification_type_id_ulid` IS NULL;--> statement-breakpoint
UPDATE `version_references` vr JOIN `versions` v ON vr.`version_id` = v.`id` SET vr.`version_id_ulid` = v.`id_ulid` WHERE vr.`version_id_ulid` IS NULL AND vr.`version_id` IS NOT NULL;--> statement-breakpoint
UPDATE `version_references` vr JOIN `references` r ON vr.`reference_id` = r.`id` SET vr.`reference_id_ulid` = r.`id_ulid` WHERE vr.`reference_id_ulid` IS NULL AND vr.`reference_id` IS NOT NULL;--> statement-breakpoint
UPDATE `versions` v JOIN `publications` p ON v.`publication_id` = p.`id` SET v.`publication_id_ulid` = p.`id_ulid` WHERE v.`publication_id_ulid` IS NULL AND v.`publication_id` IS NOT NULL;--> statement-breakpoint

-- Add foreign key constraints for the new ULID columns
ALTER TABLE `comments` ADD CONSTRAINT `comments_publication_id_ulid_publications_id_ulid_fk` FOREIGN KEY (`publication_id_ulid`) REFERENCES `publications`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_version_id_ulid_versions_id_ulid_fk` FOREIGN KEY (`version_id_ulid`) REFERENCES `versions`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_user_id_ulid_users_id_ulid_fk` FOREIGN KEY (`user_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `fk_comments_parent_ulid` FOREIGN KEY (`parent_id_ulid`) REFERENCES `comments`(`id_ulid`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_version_id_ulid_versions_id_ulid_fk` FOREIGN KEY (`version_id_ulid`) REFERENCES `versions`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_user_id_ulid_users_id_ulid_fk` FOREIGN KEY (`user_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `ca_affiliated_org_id_ulid_organizations_id_ulid_fk` FOREIGN KEY (`affiliated_org_id_ulid`) REFERENCES `organizations`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_publication_id_ulid_publications_id_ulid_fk` FOREIGN KEY (`publication_id_ulid`) REFERENCES `publications`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_user_id_ulid_users_id_ulid_fk` FOREIGN KEY (`user_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_leader_id_ulid_users_id_ulid_fk` FOREIGN KEY (`leader_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followers` ADD CONSTRAINT `followers_follower_id_ulid_users_id_ulid_fk` FOREIGN KEY (`follower_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_ulid_users_id_ulid_fk` FOREIGN KEY (`user_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_publication_id_ulid_publications_id_ulid_fk` FOREIGN KEY (`publication_id_ulid`) REFERENCES `publications`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_comment_id_ulid_comments_id_ulid_fk` FOREIGN KEY (`comment_id_ulid`) REFERENCES `comments`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_org_id_ulid_organizations_id_ulid_fk` FOREIGN KEY (`org_id_ulid`) REFERENCES `organizations`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_followers` ADD CONSTRAINT `org_followers_follower_id_ulid_users_id_ulid_fk` FOREIGN KEY (`follower_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_org_id_ulid_organizations_id_ulid_fk` FOREIGN KEY (`org_id_ulid`) REFERENCES `organizations`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_publication_id_ulid_publications_id_ulid_fk` FOREIGN KEY (`publication_id_ulid`) REFERENCES `publications`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_org_id_ulid_organizations_id_ulid_fk` FOREIGN KEY (`org_id_ulid`) REFERENCES `organizations`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_user_id_ulid_users_id_ulid_fk` FOREIGN KEY (`user_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publication_tags` ADD CONSTRAINT `publication_tags_publication_id_ulid_publications_id_ulid_fk` FOREIGN KEY (`publication_id_ulid`) REFERENCES `publications`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_owner_id_ulid_users_id_ulid_fk` FOREIGN KEY (`owner_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `temp_links` ADD CONSTRAINT `temp_links_user_id_ulid_users_id_ulid_fk` FOREIGN KEY (`user_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `user_notification_settings_user_id_ulid_users_id_ulid_fk` FOREIGN KEY (`user_id_ulid`) REFERENCES `users`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `uns_nti_notification_types_id_ulid_fk` FOREIGN KEY (`notification_type_id_ulid`) REFERENCES `notification_types`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_version_id_ulid_versions_id_ulid_fk` FOREIGN KEY (`version_id_ulid`) REFERENCES `versions`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_reference_id_ulid_references_id_ulid_fk` FOREIGN KEY (`reference_id_ulid`) REFERENCES `references`(`id_ulid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_publication_id_ulid_publications_id_ulid_fk` FOREIGN KEY (`publication_id_ulid`) REFERENCES `publications`(`id_ulid`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE `comments` DROP FOREIGN KEY `comments_publication_id_publications_id_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `comments_version_id_versions_id_fk`;
--> statement-breakpoint
ALTER TABLE `comments` DROP FOREIGN KEY `comments_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `contributor_affiliations` DROP FOREIGN KEY `contributor_affiliations_affiliated_org_id_organizations_id_fk`;
--> statement-breakpoint
ALTER TABLE `contributors` DROP FOREIGN KEY `contributors_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `org_publication_map` DROP FOREIGN KEY `org_publication_map_org_id_organizations_id_fk`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `org_user_map_org_id_organizations_id_fk`;
--> statement-breakpoint
ALTER TABLE `org_user_map` DROP FOREIGN KEY `org_user_map_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `versions` DROP FOREIGN KEY `versions_publication_id_publications_id_fk`;
--> statement-breakpoint
ALTER TABLE `temp_links` MODIFY COLUMN `code` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_affiliated_org_id_organizations_id_fk` FOREIGN KEY (`affiliated_org_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `org_publication_map_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `org_user_map_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE `publications` DROP FOREIGN KEY `publications_owner_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE `temp_links` MODIFY COLUMN `code` varchar(255) NOT NULL;