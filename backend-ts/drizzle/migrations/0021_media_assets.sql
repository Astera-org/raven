CREATE TABLE `media_assets` (
	`id` varchar(26) NOT NULL,
	`parent_id` varchar(26),
	`variant` varchar(64),
	`recipe` varchar(64),
	`storage_key` varchar(512) NOT NULL,
	`sha256` char(64) NOT NULL,
	`byte_size` bigint NOT NULL,
	`mime_type` varchar(128) NOT NULL,
	`kind` enum('audio','file','image','video') NOT NULL,
	`origin_url` text NOT NULL,
	`public_url` text NOT NULL,
	`width` int,
	`height` int,
	`status` enum('pending','processing','ready','failed') NOT NULL,
	`probe` json,
	`probe_tool` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT (NOW(3)),
	`deleted_at` datetime(3),
	`duration_ms` int,
	`video_codec` varchar(32),
	`video_codec_string` varchar(255),
	`pixel_format` varchar(32),
	`color_transfer` varchar(32),
	`rotation` int,
	`audio_codec` varchar(32),
	`audio_codec_string` varchar(255),
	CONSTRAINT `media_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `version_media_asset_map` (
	`version_id` varchar(26) NOT NULL,
	`media_asset_id` varchar(26) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `version_media_asset_map` ADD CONSTRAINT `version_media_asset_map_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `version_media_asset_map` ADD CONSTRAINT `version_media_asset_map_media_asset_id_media_assets_id_fk` FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_version_id_int` ON `version_media_asset_map` (`version_id`);