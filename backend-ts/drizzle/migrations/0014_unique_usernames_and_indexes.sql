ALTER TABLE `users` MODIFY COLUMN `username` varchar(255) NOT NULL;--> statement-breakpoint
CREATE INDEX `orcid_idx` ON `users` (`orcid`);--> statement-breakpoint
CREATE INDEX `first_last_name_idx` ON `users` (`first_name`,`last_name`);--> statement-breakpoint
CREATE INDEX `last_name_idx` ON `users` (`last_name`);--> statement-breakpoint
CREATE INDEX `state_username_idx` ON `users` (`state`,`username`);