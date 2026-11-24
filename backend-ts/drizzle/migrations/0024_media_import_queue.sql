-- Merge duplicate media_assets rows (same storage_key) into one keeper per
-- key, preferring a live row, then the newest. Repoint links to the keeper.
UPDATE `version_media_asset_map` m
JOIN (
	SELECT `id`, FIRST_VALUE(`id`) OVER (
		PARTITION BY `storage_key`
		ORDER BY `deleted_at` IS NOT NULL, `created_at` DESC, `id` DESC
	) AS `keep_id`
	FROM `media_assets`
) d ON d.`id` = m.`media_asset_id`
SET m.`media_asset_id` = d.`keep_id`
WHERE d.`id` <> d.`keep_id`;--> statement-breakpoint
-- Remove duplicate links. The table has no key yet, so add a temporary one to
-- tell identical rows apart.
ALTER TABLE `version_media_asset_map` ADD COLUMN `tmp_dedupe_id` bigint NOT NULL AUTO_INCREMENT UNIQUE;--> statement-breakpoint
DELETE m1 FROM `version_media_asset_map` m1
JOIN `version_media_asset_map` m2
	ON m1.`version_id` = m2.`version_id`
	AND m1.`media_asset_id` = m2.`media_asset_id`
	AND m1.`tmp_dedupe_id` > m2.`tmp_dedupe_id`;--> statement-breakpoint
ALTER TABLE `version_media_asset_map` DROP COLUMN `tmp_dedupe_id`;--> statement-breakpoint
DELETE a FROM `media_assets` a
JOIN (
	SELECT `id`, FIRST_VALUE(`id`) OVER (
		PARTITION BY `storage_key`
		ORDER BY `deleted_at` IS NOT NULL, `created_at` DESC, `id` DESC
	) AS `keep_id`
	FROM `media_assets`
) d ON d.`id` = a.`id`
WHERE d.`id` <> d.`keep_id`;--> statement-breakpoint
ALTER TABLE `version_media_asset_map` ADD PRIMARY KEY(`version_id`,`media_asset_id`);--> statement-breakpoint
ALTER TABLE `media_assets` ADD CONSTRAINT `idx_media_assets_storage_key` UNIQUE(`storage_key`);
--> statement-breakpoint

CREATE TABLE `media_import_batches` (
	`id` varchar(26) NOT NULL,
	`publication_id` varchar(26) NOT NULL,
	`version_id` varchar(26) NOT NULL,
	`import_id` varchar(26) NOT NULL,
	`status` enum('processing','finalizing','completed','failed') NOT NULL DEFAULT 'processing',
	`error` text,
	`total` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (NOW(3)),
	CONSTRAINT `media_import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media_import_items` (
	`id` varchar(26) NOT NULL,
	`batch_id` varchar(26) NOT NULL,
	`ref` varchar(255) NOT NULL,
	`media` json NOT NULL,
	`status` enum('pending','active','completed','failed') NOT NULL DEFAULT 'pending',
	`s3_url` text,
	`error` text,
	CONSTRAINT `media_import_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `version_imports` (
	`id` varchar(26) NOT NULL,
	`version_id` varchar(26) NOT NULL,
	`format` varchar(255) NOT NULL,
	`filename` text,
	`url` text,
	`body` mediumblob NOT NULL,
	`content_hash` char(64) NOT NULL,
	`synced_at` datetime(3) NOT NULL DEFAULT (NOW(3)),
	`created_at` datetime(3) NOT NULL DEFAULT (NOW(3)),
	CONSTRAINT `version_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `versions` ADD `current_import_id` varchar(26);--> statement-breakpoint
ALTER TABLE `media_import_batches` ADD CONSTRAINT `media_import_batches_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media_import_batches` ADD CONSTRAINT `media_import_batches_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media_import_batches` ADD CONSTRAINT `media_import_batches_import_id_version_imports_id_fk` FOREIGN KEY (`import_id`) REFERENCES `version_imports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media_import_items` ADD CONSTRAINT `media_import_items_batch_id_media_import_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `media_import_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_imports` ADD CONSTRAINT `version_imports_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `batch_status_idx` ON `media_import_items` (`batch_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_version_imports_version_created` ON `version_imports` (`version_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_current_import_id_version_imports_id_fk` FOREIGN KEY (`current_import_id`) REFERENCES `version_imports`(`id`) ON DELETE set null ON UPDATE no action;