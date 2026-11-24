CREATE TABLE `contributors` (
	`version_id_int` int NOT NULL,
	`version_id` varchar(26) NOT NULL,
	`user_id_int` int NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`roles` json NOT NULL,
	`in_byline` boolean DEFAULT false,
	`priority` int,
	CONSTRAINT `uq_version_user_int` UNIQUE(`version_id_int`,`user_id_int`),
	CONSTRAINT `uq_version_user` UNIQUE(`version_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_version_id_int_versions_id_int_fk` FOREIGN KEY (`version_id_int`) REFERENCES `versions`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors` ADD CONSTRAINT `contributors_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_contributors_version_id_int` ON `contributors` (`version_id_int`);--> statement-breakpoint
CREATE INDEX `idx_contributors_user_id_int` ON `contributors` (`user_id_int`);--> statement-breakpoint
CREATE INDEX `idx_contributors_user_id` ON `contributors` (`user_id`);--> statement-breakpoint

-- Legacy contributors were publication-scoped, so every version of a
-- publication showed the same byline: fan each one out to all of them, and
-- collapse the per-role rows into one row per (version, user).
INSERT INTO contributors (version_id_int, version_id, user_id_int, user_id, roles, in_byline, priority)
SELECT
  v.id_int,
  v.id,
  cl.user_id_int,
  cl.user_id,
  CAST(CONCAT('[', GROUP_CONCAT(DISTINCT JSON_QUOTE(cl.role) ORDER BY cl.role SEPARATOR ','), ']') AS JSON),
  COALESCE(MAX(cl.in_byline), FALSE),
  MIN(cl.priority)
FROM contributors_legacy cl
JOIN versions v ON v.publication_id = cl.publication_id
GROUP BY v.id_int, v.id, cl.user_id_int, cl.user_id;
--> statement-breakpoint

CREATE TRIGGER `contributors_bi` BEFORE INSERT ON `contributors`
FOR EACH ROW
BEGIN
  IF NEW.version_id IS NULL AND NEW.version_id_int IS NOT NULL THEN
    SET NEW.version_id = (
      SELECT id FROM versions WHERE id_int = NEW.version_id_int
    );
  ELSEIF NEW.version_id_int IS NULL AND NEW.version_id IS NOT NULL THEN
    SET NEW.version_id_int = (
      SELECT id_int FROM versions WHERE id = NEW.version_id
    );
  END IF;

  IF NEW.user_id IS NULL AND NEW.user_id_int IS NOT NULL THEN
    SET NEW.user_id = (
      SELECT id FROM users WHERE id_int = NEW.user_id_int
    );
  ELSEIF NEW.user_id_int IS NULL AND NEW.user_id IS NOT NULL THEN
    SET NEW.user_id_int = (
      SELECT id_int FROM users WHERE id = NEW.user_id
    );
  END IF;
END;
