-- If you previously skipped the initial 0000 migration then this may be a regular index instead of fulltext.
ALTER TABLE `versions` DROP INDEX `ft_search`;--> statement-breakpoint
CREATE FULLTEXT INDEX `ft_search` ON `versions` (`title`,`abstract`,`body`);
