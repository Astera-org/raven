ALTER TABLE `comments` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `followers` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_types` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `org_followers` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `publications` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `references` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `temp_links` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `user_notification_settings` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `version_references` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `versions` MODIFY COLUMN `id_ulid` varchar(26) NOT NULL;