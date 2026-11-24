-- A DELETED comment to exercise the state filter on
-- GET /comments/publication/<id>. Composes on `users-multi` +
-- `pub-published` + `pub-with-comments` (so comment ids 1, 2 are taken).

INSERT INTO comments
  (id_int, publication_id_int, version_id_int, user_id_int, body, parent_id_int, state, created_at, id)
VALUES
  (3, 1, 1, 2, 'Removed comment.', NULL, 'DELETED', '2026-01-15 14:00:00', '00000000050000000000000003');
