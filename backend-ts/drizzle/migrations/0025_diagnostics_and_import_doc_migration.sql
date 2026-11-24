ALTER TABLE `version_imports` ADD `diagnostics` json;--> statement-breakpoint
ALTER TABLE `media_import_items` ADD `data` mediumblob;--> statement-breakpoint

-- This column was just added but is unused, so it's best to remove it until needed
ALTER TABLE `version_imports` DROP COLUMN `content_hash`;--> statement-breakpoint

-- Copy each version's import document into version_imports and make it the
-- version's current import. ULID_FROM_DATETIME is installed by migrate.ts.
-- content_hash mirrors createVersionImport's sha256 of body.
INSERT INTO `version_imports` (`id`, `version_id`, `format`, `filename`, `url`, `body`, `synced_at`, `created_at`)
SELECT
	ULID_FROM_DATETIME(COALESCE(v.`import_document_sync_date`, v.`created_at`)),
	v.`id`,
	v.`import_document_format`,
	v.`import_document_filename`,
	v.`import_document_url`,
	COALESCE(v.`import_document_body`, ''),
	COALESCE(v.`import_document_sync_date`, v.`created_at`),
	COALESCE(v.`import_document_sync_date`, v.`created_at`)
FROM `versions` v
WHERE v.`import_document_format` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM `version_imports` cur
		WHERE cur.`id` = v.`current_import_id`
	);--> statement-breakpoint
-- version_imports was created above, so each version has at most one row.
UPDATE `versions` v
JOIN `version_imports` vi ON vi.`version_id` = v.`id`
SET v.`current_import_id` = vi.`id`
WHERE v.`current_import_id` IS NULL
	AND v.`import_document_format` IS NOT NULL;