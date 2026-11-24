CREATE TABLE `device_codes` (
	`id` varchar(26) NOT NULL,
	`device_code` varchar(255) NOT NULL,
	`user_code` varchar(255) NOT NULL,
	`user_id` text,
	`expires_at` datetime(3) NOT NULL,
	`status` text NOT NULL,
	`last_polled_at` datetime(3),
	`polling_interval` int,
	`client_id` text,
	`scope` text,
	CONSTRAINT `device_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_codes_device_code_unique` UNIQUE(`device_code`)
);
--> statement-breakpoint
CREATE INDEX `device_codes_user_code_idx` ON `device_codes` (`user_code`);