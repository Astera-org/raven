ALTER TABLE `linked_assets` ADD `version_id` varchar(26);--> statement-breakpoint
ALTER TABLE `linked_assets` ADD CONSTRAINT `linked_assets_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Backfill ULID-based foreign keys for existing rows
-- (covers every nullable FK ulid column, not just the one added above,
-- since none are notNull yet and any that were missed by earlier
-- backfills need to be filled in before they can be made notNull)
UPDATE `comments` c JOIN `publications` p ON c.`publication_id_int` = p.`id_int` SET c.`publication_id` = p.`id` WHERE c.`publication_id` IS NULL;--> statement-breakpoint
UPDATE `comments` c JOIN `versions` v ON c.`version_id_int` = v.`id_int` SET c.`version_id` = v.`id` WHERE c.`version_id` IS NULL AND c.`version_id_int` IS NOT NULL;--> statement-breakpoint
UPDATE `comments` c JOIN `users` u ON c.`user_id_int` = u.`id_int` SET c.`user_id` = u.`id` WHERE c.`user_id` IS NULL;--> statement-breakpoint
UPDATE `comments` c JOIN `comments` p ON c.`parent_id_int` = p.`id_int` SET c.`parent_id` = p.`id` WHERE c.`parent_id` IS NULL AND c.`parent_id_int` IS NOT NULL;--> statement-breakpoint
UPDATE `contributor_affiliations` ca JOIN `versions` v ON ca.`version_id_int` = v.`id_int` SET ca.`version_id` = v.`id` WHERE ca.`version_id` IS NULL;--> statement-breakpoint
UPDATE `contributor_affiliations` ca JOIN `users` u ON ca.`user_id_int` = u.`id_int` SET ca.`user_id` = u.`id` WHERE ca.`user_id` IS NULL;--> statement-breakpoint
UPDATE `contributor_affiliations` ca JOIN `organizations` o ON ca.`affiliated_org_id_int` = o.`id_int` SET ca.`affiliated_org_id` = o.`id` WHERE ca.`affiliated_org_id` IS NULL;--> statement-breakpoint
UPDATE `contributors` c JOIN `publications` p ON c.`publication_id_int` = p.`id_int` SET c.`publication_id` = p.`id` WHERE c.`publication_id` IS NULL;--> statement-breakpoint
UPDATE `contributors` c JOIN `users` u ON c.`user_id_int` = u.`id_int` SET c.`user_id` = u.`id` WHERE c.`user_id` IS NULL;--> statement-breakpoint
UPDATE `followers` f JOIN `users` l ON f.`leader_id_int` = l.`id_int` SET f.`leader_id` = l.`id` WHERE f.`leader_id` IS NULL;--> statement-breakpoint
UPDATE `followers` f JOIN `users` u ON f.`follower_id_int` = u.`id_int` SET f.`follower_id` = u.`id` WHERE f.`follower_id` IS NULL;--> statement-breakpoint
UPDATE `linked_assets` la JOIN `versions` v ON la.`version_id_int` = v.`id_int` SET la.`version_id` = v.`id` WHERE la.`version_id` IS NULL;--> statement-breakpoint
UPDATE `notifications` n JOIN `users` u ON n.`user_id_int` = u.`id_int` SET n.`user_id` = u.`id` WHERE n.`user_id` IS NULL;--> statement-breakpoint
UPDATE `notifications` n JOIN `publications` p ON n.`publication_id_int` = p.`id_int` SET n.`publication_id` = p.`id` WHERE n.`publication_id` IS NULL AND n.`publication_id_int` IS NOT NULL;--> statement-breakpoint
UPDATE `notifications` n JOIN `comments` c ON n.`comment_id_int` = c.`id_int` SET n.`comment_id` = c.`id` WHERE n.`comment_id` IS NULL AND n.`comment_id_int` IS NOT NULL;--> statement-breakpoint
UPDATE `org_followers` org_f JOIN `organizations` o ON org_f.`org_id_int` = o.`id_int` SET org_f.`org_id` = o.`id` WHERE org_f.`org_id` IS NULL;--> statement-breakpoint
UPDATE `org_followers` org_f JOIN `users` u ON org_f.`follower_id_int` = u.`id_int` SET org_f.`follower_id` = u.`id` WHERE org_f.`follower_id` IS NULL;--> statement-breakpoint
UPDATE `org_publication_map` opm JOIN `organizations` o ON opm.`org_id_int` = o.`id_int` SET opm.`org_id` = o.`id` WHERE opm.`org_id` IS NULL;--> statement-breakpoint
UPDATE `org_publication_map` opm JOIN `publications` p ON opm.`publication_id_int` = p.`id_int` SET opm.`publication_id` = p.`id` WHERE opm.`publication_id` IS NULL;--> statement-breakpoint
UPDATE `org_user_map` oum JOIN `organizations` o ON oum.`org_id_int` = o.`id_int` SET oum.`org_id` = o.`id` WHERE oum.`org_id` IS NULL;--> statement-breakpoint
UPDATE `org_user_map` oum JOIN `users` u ON oum.`user_id_int` = u.`id_int` SET oum.`user_id` = u.`id` WHERE oum.`user_id` IS NULL;--> statement-breakpoint
UPDATE `publication_tags` pt JOIN `publications` p ON pt.`publication_id_int` = p.`id_int` SET pt.`publication_id` = p.`id` WHERE pt.`publication_id` IS NULL;--> statement-breakpoint
UPDATE `publications` p JOIN `users` u ON p.`owner_id_int` = u.`id_int` SET p.`owner_id` = u.`id` WHERE p.`owner_id` IS NULL AND p.`owner_id_int` IS NOT NULL;--> statement-breakpoint
UPDATE `temp_links` tl JOIN `users` u ON tl.`user_id_int` = u.`id_int` SET tl.`user_id` = u.`id` WHERE tl.`user_id` IS NULL;--> statement-breakpoint
UPDATE `user_notification_settings` uns JOIN `users` u ON uns.`user_id_int` = u.`id_int` SET uns.`user_id` = u.`id` WHERE uns.`user_id` IS NULL;--> statement-breakpoint
UPDATE `user_notification_settings` uns JOIN `notification_types` nt ON uns.`notification_type_id_int` = nt.`id_int` SET uns.`notification_type_id` = nt.`id` WHERE uns.`notification_type_id` IS NULL;--> statement-breakpoint
UPDATE `version_references` vr JOIN `versions` v ON vr.`version_id_int` = v.`id_int` SET vr.`version_id` = v.`id` WHERE vr.`version_id` IS NULL;--> statement-breakpoint
UPDATE `version_references` vr JOIN `references` r ON vr.`reference_id_int` = r.`id_int` SET vr.`reference_id` = r.`id` WHERE vr.`reference_id` IS NULL;--> statement-breakpoint
UPDATE `versions` v JOIN `publications` p ON v.`publication_id_int` = p.`id_int` SET v.`publication_id` = p.`id` WHERE v.`publication_id` IS NULL;--> statement-breakpoint

-- Set all ULID FK columns to NOT NULL
-- Excludes those that are already nullable for the int ID
ALTER TABLE `comments` MODIFY COLUMN `publication_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `user_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` MODIFY COLUMN `version_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` MODIFY COLUMN `user_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `contributor_affiliations` MODIFY COLUMN `affiliated_org_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `contributors` MODIFY COLUMN `publication_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `contributors` MODIFY COLUMN `user_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `followers` MODIFY COLUMN `leader_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `followers` MODIFY COLUMN `follower_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `linked_assets` MODIFY COLUMN `version_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `user_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `org_followers` MODIFY COLUMN `org_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `org_followers` MODIFY COLUMN `follower_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `org_publication_map` MODIFY COLUMN `org_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `org_publication_map` MODIFY COLUMN `publication_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `org_user_map` MODIFY COLUMN `org_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `org_user_map` MODIFY COLUMN `user_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `publication_tags` MODIFY COLUMN `publication_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `temp_links` MODIFY COLUMN `user_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `user_notification_settings` MODIFY COLUMN `user_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `user_notification_settings` MODIFY COLUMN `notification_type_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `version_references` MODIFY COLUMN `version_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `version_references` MODIFY COLUMN `reference_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `versions` DROP FOREIGN KEY `versions_publication_id_publications_id_fk`;--> statement-breakpoint
ALTER TABLE `versions` MODIFY COLUMN `publication_id` varchar(26) NOT NULL;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_publication_id_publications_id_fk` FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- Adds BEFORE INSERT triggers to keep every id (ULID) / id_int (integer)
-- column pair in sync during the numeric-id -> ULID migration.
--
-- For a table's own id/id_int pair, a missing ULID is generated with the
-- ULID() function (added by addUlidFunctions() before migrations run).
-- id_int is never missing at trigger time since it's an AUTO_INCREMENT
-- column, whose value MySQL assigns before BEFORE INSERT triggers fire.
--
-- For a foreign-key id/id_int pair, a missing side is looked up from the
-- referenced table using whichever side was provided.
CREATE TRIGGER `users_bi` BEFORE INSERT ON `users`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `publications_bi` BEFORE INSERT ON `publications`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.owner_id IS NULL AND NEW.owner_id_int IS NOT NULL THEN
    SET NEW.owner_id = (
      SELECT id FROM users WHERE id_int = NEW.owner_id_int
    );
  ELSEIF NEW.owner_id_int IS NULL AND NEW.owner_id IS NOT NULL THEN
    SET NEW.owner_id_int = (
      SELECT id_int FROM users WHERE id = NEW.owner_id
    );
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `versions_bi` BEFORE INSERT ON `versions`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `contributors_bi` BEFORE INSERT ON `contributors`
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
END;--> statement-breakpoint
CREATE TRIGGER `contributor_affiliations_bi` BEFORE INSERT ON `contributor_affiliations`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

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

  IF NEW.affiliated_org_id IS NULL AND NEW.affiliated_org_id_int IS NOT NULL THEN
    SET NEW.affiliated_org_id = (
      SELECT id FROM organizations WHERE id_int = NEW.affiliated_org_id_int
    );
  ELSEIF NEW.affiliated_org_id_int IS NULL AND NEW.affiliated_org_id IS NOT NULL THEN
    SET NEW.affiliated_org_id_int = (
      SELECT id_int FROM organizations WHERE id = NEW.affiliated_org_id
    );
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `organizations_bi` BEFORE INSERT ON `organizations`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `org_user_map_bi` BEFORE INSERT ON `org_user_map`
FOR EACH ROW
BEGIN
  IF NEW.org_id IS NULL AND NEW.org_id_int IS NOT NULL THEN
    SET NEW.org_id = (
      SELECT id FROM organizations WHERE id_int = NEW.org_id_int
    );
  ELSEIF NEW.org_id_int IS NULL AND NEW.org_id IS NOT NULL THEN
    SET NEW.org_id_int = (
      SELECT id_int FROM organizations WHERE id = NEW.org_id
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
END;--> statement-breakpoint
CREATE TRIGGER `org_publication_map_bi` BEFORE INSERT ON `org_publication_map`
FOR EACH ROW
BEGIN
  IF NEW.org_id IS NULL AND NEW.org_id_int IS NOT NULL THEN
    SET NEW.org_id = (
      SELECT id FROM organizations WHERE id_int = NEW.org_id_int
    );
  ELSEIF NEW.org_id_int IS NULL AND NEW.org_id IS NOT NULL THEN
    SET NEW.org_id_int = (
      SELECT id_int FROM organizations WHERE id = NEW.org_id
    );
  END IF;

  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `comments_bi` BEFORE INSERT ON `comments`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;

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

  IF NEW.parent_id IS NULL AND NEW.parent_id_int IS NOT NULL THEN
    SET NEW.parent_id = (
      SELECT id FROM comments WHERE id_int = NEW.parent_id_int
    );
  ELSEIF NEW.parent_id_int IS NULL AND NEW.parent_id IS NOT NULL THEN
    SET NEW.parent_id_int = (
      SELECT id_int FROM comments WHERE id = NEW.parent_id
    );
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `publication_tags_bi` BEFORE INSERT ON `publication_tags`
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
END;--> statement-breakpoint
CREATE TRIGGER `references_bi` BEFORE INSERT ON `references`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `version_references_bi` BEFORE INSERT ON `version_references`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.version_id IS NULL AND NEW.version_id_int IS NOT NULL THEN
    SET NEW.version_id = (
      SELECT id FROM versions WHERE id_int = NEW.version_id_int
    );
  ELSEIF NEW.version_id_int IS NULL AND NEW.version_id IS NOT NULL THEN
    SET NEW.version_id_int = (
      SELECT id_int FROM versions WHERE id = NEW.version_id
    );
  END IF;

  IF NEW.reference_id IS NULL AND NEW.reference_id_int IS NOT NULL THEN
    SET NEW.reference_id = (
      SELECT id FROM `references` WHERE id_int = NEW.reference_id_int
    );
  ELSEIF NEW.reference_id_int IS NULL AND NEW.reference_id IS NOT NULL THEN
    SET NEW.reference_id_int = (
      SELECT id_int FROM `references` WHERE id = NEW.reference_id
    );
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `linked_assets_bi` BEFORE INSERT ON `linked_assets`
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
END;--> statement-breakpoint
CREATE TRIGGER `notifications_bi` BEFORE INSERT ON `notifications`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
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

  IF NEW.publication_id IS NULL AND NEW.publication_id_int IS NOT NULL THEN
    SET NEW.publication_id = (
      SELECT id FROM publications WHERE id_int = NEW.publication_id_int
    );
  ELSEIF NEW.publication_id_int IS NULL AND NEW.publication_id IS NOT NULL THEN
    SET NEW.publication_id_int = (
      SELECT id_int FROM publications WHERE id = NEW.publication_id
    );
  END IF;

  IF NEW.comment_id IS NULL AND NEW.comment_id_int IS NOT NULL THEN
    SET NEW.comment_id = (
      SELECT id FROM comments WHERE id_int = NEW.comment_id_int
    );
  ELSEIF NEW.comment_id_int IS NULL AND NEW.comment_id IS NOT NULL THEN
    SET NEW.comment_id_int = (
      SELECT id_int FROM comments WHERE id = NEW.comment_id
    );
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `notification_types_bi` BEFORE INSERT ON `notification_types`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `user_notification_settings_bi` BEFORE INSERT ON `user_notification_settings`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
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

  IF NEW.notification_type_id IS NULL AND NEW.notification_type_id_int IS NOT NULL THEN
    SET NEW.notification_type_id = (
      SELECT id FROM notification_types WHERE id_int = NEW.notification_type_id_int
    );
  ELSEIF NEW.notification_type_id_int IS NULL AND NEW.notification_type_id IS NOT NULL THEN
    SET NEW.notification_type_id_int = (
      SELECT id_int FROM notification_types WHERE id = NEW.notification_type_id
    );
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `temp_links_bi` BEFORE INSERT ON `temp_links`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
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
END;--> statement-breakpoint
CREATE TRIGGER `followers_bi` BEFORE INSERT ON `followers`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.leader_id IS NULL AND NEW.leader_id_int IS NOT NULL THEN
    SET NEW.leader_id = (
      SELECT id FROM users WHERE id_int = NEW.leader_id_int
    );
  ELSEIF NEW.leader_id_int IS NULL AND NEW.leader_id IS NOT NULL THEN
    SET NEW.leader_id_int = (
      SELECT id_int FROM users WHERE id = NEW.leader_id
    );
  END IF;

  IF NEW.follower_id IS NULL AND NEW.follower_id_int IS NOT NULL THEN
    SET NEW.follower_id = (
      SELECT id FROM users WHERE id_int = NEW.follower_id_int
    );
  ELSEIF NEW.follower_id_int IS NULL AND NEW.follower_id IS NOT NULL THEN
    SET NEW.follower_id_int = (
      SELECT id_int FROM users WHERE id = NEW.follower_id
    );
  END IF;
END;--> statement-breakpoint
CREATE TRIGGER `org_followers_bi` BEFORE INSERT ON `org_followers`
FOR EACH ROW
BEGIN
  IF NEW.id IS NULL THEN
    SET NEW.id = ULID();
  END IF;

  IF NEW.org_id IS NULL AND NEW.org_id_int IS NOT NULL THEN
    SET NEW.org_id = (
      SELECT id FROM organizations WHERE id_int = NEW.org_id_int
    );
  ELSEIF NEW.org_id_int IS NULL AND NEW.org_id IS NOT NULL THEN
    SET NEW.org_id_int = (
      SELECT id_int FROM organizations WHERE id = NEW.org_id
    );
  END IF;

  IF NEW.follower_id IS NULL AND NEW.follower_id_int IS NOT NULL THEN
    SET NEW.follower_id = (
      SELECT id FROM users WHERE id_int = NEW.follower_id_int
    );
  ELSEIF NEW.follower_id_int IS NULL AND NEW.follower_id IS NOT NULL THEN
    SET NEW.follower_id_int = (
      SELECT id_int FROM users WHERE id = NEW.follower_id
    );
  END IF;
END;