-- Single user fixture for login / authenticated-request tests.
--
-- Username: alice
-- Password: password123 (hashed with Werkzeug scrypt; the matching plaintext
--   is the harness-wide convention used by `loginAs()` in harness/auth.ts).
--
-- The scrypt hash below was generated with werkzeug.security.generate_password_hash.
-- Werkzeug's verifier accepts any valid scrypt hash for the right password,
-- so the random salt baked into this string is fine to commit.

INSERT INTO notification_types (type, name, description, state, `trigger`, priority, id) VALUES
            ('NEW_COMMENT__PARENT_COMMENTER', 'Replies to your comments', 'Notifies you when someone replies to a comment you authored.', 'ACTIVE', 'NEW_COMMENT', 1, '00000000070000000000000001'),
            ('NEW_COMMENT__BYLINE_CONTRIB', 'Comments on publications where you are a byline contributor', 'Notifies you when a new comment is posted on a publication where you are a byline contributor.', 'ACTIVE', 'NEW_COMMENT', 2, '00000000070000000000000002'),
            ('NEW_COMMENT__NON_BYLINE_CONTRIB', 'Comments on publications where you are a non-byline contributor', 'Notifies you when a new comment is posted on a publication where you are a non-byline contributor.', 'ACTIVE', 'NEW_COMMENT', 3, '00000000070000000000000003'),
            ('NEW_COMMENT__ORG_ADMIN', 'Comments on publications linked to organizations that you manage', 'Notifies you when a new comment is posted on a publication linked to an organization you manage.', 'ACTIVE', 'NEW_COMMENT', 4, '00000000070000000000000004');

-- comment_id/publication_id (varchar) are set alongside the *_int columns
-- because the Drizzle `comment`/`publication` relations join on the varchar
-- FKs, not the int ones (see notificationsRelations in db/relations.ts).
-- Values match `pub-published` (publication=1) and `pub-with-comments`
-- (comment=1), which this fixture is always composed with.
insert into `notifications` (`comment_id_int`, `comment_id`, `created_at`, `id_int`, `id`, `message`, `publication_id_int`, `publication_id`, `seen`, `state`, `user_id_int`) values (1, '00000000050000000000000001', '2025-12-04 20:10:41', 202, '0000000006000000000000006A', 'Bob Ross commented: Highly interesting. Agree that the clouds are happy.', 1, '00000000030000000000000001', 1, 'COMMENT', 1);
insert into `notifications` (`comment_id_int`, `comment_id`, `created_at`, `id_int`, `id`, `message`, `publication_id_int`, `publication_id`, `seen`, `state`, `user_id_int`) values (1, '00000000050000000000000001', '2025-12-04 20:11:41', 203, '0000000006000000000000006B', 'Bob Ross commented: Llamas are my favorite animal to paint.', 1, '00000000030000000000000001', 0, 'COMMENT', 1);
insert into `notifications` (`comment_id_int`, `comment_id`, `created_at`, `id_int`, `id`, `message`, `publication_id_int`, `publication_id`, `seen`, `state`, `user_id_int`) values (1, '00000000050000000000000001', '2025-12-04 20:12:41', 204, '0000000006000000000000006C', 'Bob Ross commented: The secret to doing anything is believing that you can do it.', 1, '00000000030000000000000001', 1, 'COMMENT', 1);
-- Soft-deleted and unseen, so it would surface in any read path (lists,
-- counts, unread views) that forgets to filter on `deleted_at`.
insert into `notifications` (`comment_id_int`, `comment_id`, `created_at`, `deleted_at`, `id_int`, `id`, `message`, `publication_id_int`, `publication_id`, `seen`, `state`, `user_id_int`) values (1, '00000000050000000000000001', '2025-12-04 20:13:41', '2025-12-05 09:00:00', 205, '0000000006000000000000006D', 'Bob Ross commented: This notification was deleted by its recipient.', 1, '00000000030000000000000001', 0, 'COMMENT', 1);
