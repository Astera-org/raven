-- Two PUBLISHED comments on publication id=1, version id=1.
-- Composes on top of `users-multi` + `pub-published`.
--   id=1 top-level comment by alice
--   id=2 reply to comment 1 by bob

INSERT INTO comments
  (publication_id_int, version_id_int, user_id_int, body, parent_id_int, state, created_at, id)
VALUES
  (1, 1, 1, 'Top-level thought from Alice.', NULL, 'PUBLISHED', '2026-01-15 12:30:00', '00000000050000000000000001'),
  (1, 1, 2, 'Bob replying to Alice.',         1,    'PUBLISHED', '2026-01-15 13:00:00', '00000000050000000000000002');
