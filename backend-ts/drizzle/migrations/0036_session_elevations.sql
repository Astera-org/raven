CREATE TABLE `session_elevations` (
	`id` varchar(26) NOT NULL,
	`session_id` varchar(26) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `session_elevations_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_elevations_session_id_unique` UNIQUE(`session_id`)
);
--> statement-breakpoint
ALTER TABLE `session_elevations` ADD CONSTRAINT `session_elevations_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade ON UPDATE no action;