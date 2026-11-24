-- A DRAFT publication owned by alice (user id=1). Used to verify that
-- list/sitemap/RSS responses exclude non-PUBLISHED publications.
-- Composes on `users-basic` (or `users-multi`). Stable id = 99 to avoid
-- colliding with `pubs-multi.sql` (1..3) and `pub-published.sql` (1).

INSERT INTO publications
  (id_int, slug, latest_version_number, state, owner_id_int, license, created_at, id)
VALUES
  (99, 'unpublished-draft', 1, 'DRAFT', 1, 'CC BY', '2026-04-01 12:00:00', '00000000030000000000000033');

INSERT INTO versions
  (id_int, publication_id_int, version_number, title, subtitle, abstract, body, state,
   created_at, updated_at, id)
VALUES
  (99, 99, 1, 'Unpublished Draft', NULL,
   'Draft abstract.', 'Draft body.',
   'DRAFT', '2026-04-01 12:00:00', '2026-04-01 12:00:00', '00000000040000000000000033');

INSERT INTO `contributors` (`version_id_int`, `user_id_int`, `roles`, `in_byline`, `priority`)
VALUES (99, 1, '["Supervision"]', 1, 1);
