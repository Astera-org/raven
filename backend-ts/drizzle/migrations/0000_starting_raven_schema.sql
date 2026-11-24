-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations

CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publication_id` int NOT NULL,
	`version_id` int,
	`user_id` int NOT NULL,
	`parent_id` int,
	`body` text NOT NULL,
	`anchor_text` varchar(1024),
	`pre_text` varchar(128),
	`post_text` varchar(128),
	`approved` tinyint(1) DEFAULT 0,
	`state` enum('PUBLISHED','MODERATED','DELETED') DEFAULT 'PUBLISHED',
	`created_at` datetime DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` datetime,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contributor_affiliations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version_id` int NOT NULL,
	`user_id` int NOT NULL,
	`affiliated_org_id` int NOT NULL,
	CONSTRAINT `contributor_affiliations_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_version_user_org` UNIQUE(`version_id`,`user_id`,`affiliated_org_id`)
);
--> statement-breakpoint
CREATE TABLE `contributors` (
	`publication_id` int NOT NULL,
	`user_id` int NOT NULL,
	`priority` int,
	`role` varchar(255) NOT NULL,
	`in_byline` tinyint(1) DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `linked_assets` (
	`version_id` int NOT NULL,
	`type` varchar(255) NOT NULL,
	`url` varchar(255) NOT NULL,
	`name` varchar(255),
	CONSTRAINT `version_id` UNIQUE(`version_id`,`type`,`url`)
);
--> statement-breakpoint
CREATE TABLE `notification_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`state` enum('ACTIVE','DEPRECATED') NOT NULL DEFAULT 'ACTIVE',
	`trigger` enum('NEW_COMMENT'),
	`priority` int,
	`created_at` datetime DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT `notification_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_type` UNIQUE(`type`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`publication_id` int,
	`comment_id` int,
	`message` text,
	`state` enum('NEW_PUBLICATION','UPDATED_PUBLICATION','COMMENT','REPLY','MESSAGE') DEFAULT 'NEW_PUBLICATION',
	`seen` tinyint(1) DEFAULT 0,
	`created_at` datetime DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `org_publication_map` (
	`org_id` int NOT NULL,
	`publication_id` int NOT NULL,
	`priority` int,
	CONSTRAINT `idx_org_publication` UNIQUE(`org_id`,`publication_id`)
);
--> statement-breakpoint
CREATE TABLE `org_user_map` (
	`org_id` int NOT NULL,
	`user_id` int NOT NULL,
	`roles` set('ADMIN'),
	`start_at` datetime,
	`end_at` datetime,
	CONSTRAINT `idx_org_user` UNIQUE(`org_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`avatar` varchar(255),
	`profile` text,
	`ror_id` varchar(255),
	`doi_minting_enabled` tinyint(1) DEFAULT 0,
	`doi_prefix` varchar(50),
	`unlisted` tinyint(1) DEFAULT 0,
	`approved` tinyint(1) DEFAULT 0,
	`state` enum('ACTIVE','MODERATED','DELETED') DEFAULT 'ACTIVE',
	`created_at` datetime DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` datetime,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `publication_tags` (
	`publication_id` int NOT NULL,
	`tag` varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(255) NOT NULL,
	`latest_version_number` tinyint unsigned NOT NULL DEFAULT 1,
	`state` enum('DRAFT','PUBLISHED','DELETED') NOT NULL DEFAULT 'DRAFT',
	`owner_id` int,
	`doi` varchar(255),
	`metadata` json,
	`license` enum('CC BY','CC BY-SA','CC BY-ND','CC BY-NC','CC BY-NC-SA','CC BY-NC-ND','CC0') NOT NULL DEFAULT 'CC BY',
	`created_at` datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`feedback_form_embed_src` text,
	`social_posts_embed_src` text,
	CONSTRAINT `publications_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_slug` UNIQUE(`slug`),
	CONSTRAINT `idx_doi` UNIQUE(`doi`)
);
--> statement-breakpoint
CREATE TABLE `references` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` varchar(255) NOT NULL,
	`text` text,
	`updated_at` datetime,
	CONSTRAINT `references_id` PRIMARY KEY(`id`),
	CONSTRAINT `url` UNIQUE(`url`)
);
--> statement-breakpoint
CREATE TABLE `temp_links` (
	`user_id` int NOT NULL,
	`code` varchar(40) NOT NULL,
	`created_at` datetime DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `user_notification_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`notification_type_id` int NOT NULL,
	`delivery_method` enum('EMAIL','IN_APP') NOT NULL,
	`is_subscribed` tinyint(1) NOT NULL DEFAULT 1,
	`created_at` datetime DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT `user_notification_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_user_type_method` UNIQUE(`user_id`,`notification_type_id`,`delivery_method`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(255) NOT NULL,
	`password` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`first_name` varchar(255) NOT NULL,
	`last_name` varchar(255) NOT NULL,
	`avatar` varchar(255),
	`profile` text,
	`orcid` varchar(255),
	`google_id` varchar(255),
	`approved` tinyint(1) DEFAULT 0,
	`state` enum('ACTIVE','SITE_ADMIN','MODERATED','DELETED') DEFAULT 'ACTIVE',
	`created_at` datetime DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` datetime,
	`login_at` datetime,
	`clerk_id` varchar(255),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_users_clerk_id` UNIQUE(`clerk_id`)
);
--> statement-breakpoint
CREATE TABLE `version_references` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version_id` int NOT NULL,
	`reference_id` int NOT NULL,
	CONSTRAINT `version_references_id` PRIMARY KEY(`id`),
	CONSTRAINT `version_id` UNIQUE(`version_id`,`reference_id`)
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publication_id` int NOT NULL,
	`version_number` tinyint unsigned NOT NULL DEFAULT 1,
	`title` varchar(255),
	`subtitle` varchar(300),
	`abstract` text,
	`body` mediumtext,
	`version_desc` text,
	`state` enum('DRAFT','PUBLISHED','DELETED') NOT NULL DEFAULT 'DRAFT',
	`pdf_state` enum('PROCESSING','GENERATED','FAILED'),
	`pdf_url` varchar(255),
	`created_at` datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`doi` varchar(255),
	CONSTRAINT `versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_publication_version` UNIQUE(`publication_id`,`version_number`),
	CONSTRAINT `idx_version_doi` UNIQUE(`doi`)
);
--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `fk_comments_parent` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `fk_comments_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `fk_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `fk_comments_version` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_ibfk_1` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` ADD CONSTRAINT `contributor_affiliations_ibfk_3` FOREIGN KEY (`affiliated_org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `fk_contributors_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `fk_contributors_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `linked_assets` ADD CONSTRAINT `fk_linked_assets_version` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notifications_comment` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notifications_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `fk_org_publication_org` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_publication_map` ADD CONSTRAINT `fk_org_publication_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `fk_org_user_org` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_user_map` ADD CONSTRAINT `fk_org_user_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publication_tags` ADD CONSTRAINT `fk_publication_tags_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publications` ADD CONSTRAINT `publications_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `user_notification_settings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_notification_settings` ADD CONSTRAINT `user_notification_settings_ibfk_2` FOREIGN KEY (`notification_type_id`) REFERENCES `notification_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `fk_version_references_version` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_references` ADD CONSTRAINT `version_references_ibfk_2` FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_ibfk_1` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_publication_state` ON `comments` (`publication_id`,`state`);--> statement-breakpoint
CREATE INDEX `user_id` ON `contributor_affiliations` (`user_id`);--> statement-breakpoint
CREATE INDEX `affiliated_org_id` ON `contributor_affiliations` (`affiliated_org_id`);--> statement-breakpoint
CREATE INDEX `idx_publication_id` ON `contributors` (`publication_id`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `contributors` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_publication_id` ON `org_publication_map` (`publication_id`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `org_user_map` (`user_id`);--> statement-breakpoint
CREATE INDEX `owner_id` ON `publications` (`owner_id`);--> statement-breakpoint
CREATE INDEX `notification_type_id` ON `user_notification_settings` (`notification_type_id`);--> statement-breakpoint
CREATE INDEX `reference_id` ON `version_references` (`reference_id`);--> statement-breakpoint
CREATE FULLTEXT INDEX `ft_search` ON `versions` (`title`,`abstract`,`body`);
