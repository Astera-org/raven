-- Seeds the notification types originally inserted by the legacy Python migration
-- 2600daea5cd5. INSERT IGNORE leaves existing rows (matched on the unique `type`)
-- untouched, so databases that already have them are unaffected.
INSERT IGNORE INTO `notification_types` (`type`, `name`, `description`, `state`, `trigger`, `priority`) VALUES
  ('NEW_COMMENT__PARENT_COMMENTER', 'Replies to your comments', 'Notifies you when someone replies to a comment you authored.', 'ACTIVE', 'NEW_COMMENT', 1),
  ('NEW_COMMENT__BYLINE_CONTRIB', 'Comments on publications where you are a byline contributor', 'Notifies you when a new comment is posted on a publication where you are a byline contributor.', 'ACTIVE', 'NEW_COMMENT', 2),
  ('NEW_COMMENT__NON_BYLINE_CONTRIB', 'Comments on publications where you are a non-byline contributor', 'Notifies you when a new comment is posted on a publication where you are a non-byline contributor.', 'ACTIVE', 'NEW_COMMENT', 3),
  ('NEW_COMMENT__ORG_ADMIN', 'Comments on publications linked to organizations that you manage', 'Notifies you when a new comment is posted on a publication linked to an organization you manage.', 'ACTIVE', 'NEW_COMMENT', 4);
