-- A fresh, reply-free PUBLISHED comment owned by alice, created just now.
-- Used to exercise a successful PATCH body edit: the edit route requires
-- created_at to be within the last hour and the comment to have no
-- replies, so the hardcoded-old, replied-to comments in
-- `pub-with-comments` (ids 1, 2) can't be used for a "this edit succeeds"
-- case. Composes on `users-multi` + `pub-published` + `pub-with-comments`
-- (so comment ids 1, 2 are taken).

INSERT INTO comments
  (id_int, publication_id_int, version_id_int, user_id_int, body, parent_id_int, state, created_at, id)
VALUES
  (3, 1, 1, 1, 'Fresh comment, still editable.', NULL, 'PUBLISHED', NOW(), '00000000050000000000000003');
