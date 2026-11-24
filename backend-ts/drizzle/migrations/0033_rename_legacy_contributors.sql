RENAME TABLE `contributors` TO `contributors_legacy`;--> statement-breakpoint
ALTER TABLE `contributors_legacy` DROP FOREIGN KEY `contributors_publication_id_int_publications_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `contributors_legacy` DROP FOREIGN KEY `contributors_publication_id_publications_id_fk`;
--> statement-breakpoint
ALTER TABLE `contributors_legacy` DROP FOREIGN KEY `contributors_user_id_int_users_id_int_fk`;
--> statement-breakpoint
ALTER TABLE `contributors_legacy` DROP FOREIGN KEY `contributors_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `contributors_legacy` ADD CONSTRAINT `contributors_legacy_publication_id_int_publications_id_int_fk` FOREIGN KEY (`publication_id_int`) REFERENCES `publications`(`id_int`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors_legacy` ADD CONSTRAINT `contributors_legacy_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors_legacy` ADD CONSTRAINT `contributors_legacy_user_id_int_users_id_int_fk` FOREIGN KEY (`user_id_int`) REFERENCES `users`(`id_int`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributors_legacy` ADD CONSTRAINT `contributors_legacy_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- RENAME TABLE carries the trigger along under its old name, which would
-- collide with the trigger a future `contributors` table needs.
DROP TRIGGER IF EXISTS `contributors_bi`;--> statement-breakpoint
CREATE TRIGGER `contributors_legacy_bi` BEFORE INSERT ON `contributors_legacy`
FOR EACH ROW
BEGIN
  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
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
