ALTER TABLE `versions` ADD `import_document_filename` text;--> statement-breakpoint
ALTER TABLE `versions` ADD `import_document_url` text;--> statement-breakpoint
ALTER TABLE `versions` ADD `import_document_format` varchar(255);--> statement-breakpoint
ALTER TABLE `versions` ADD `import_document_body` mediumtext;--> statement-breakpoint
ALTER TABLE `versions` ADD `import_document_sync_date` datetime;