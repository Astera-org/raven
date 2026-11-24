-- A PUBLISHED comment (id=4) whose body uses characters that are
-- markdown-significant (`_`, `*`, `[`) as ordinary prose, not intentional
-- formatting, plus a notification (id=206) pointing at it. Regression
-- fixture for markdownToText: these characters must come back as plain
-- text in commentTextExcerpt, not backslash-escaped markdown artifacts
-- (e.g. `my\_variable\_name`) reintroduced by piping stripped markdown
-- back through remark-stringify.
--
-- Composes on top of `pub-published` + `pub-with-comments` (comment ids
-- 1-2 are taken there; uses id=4 to also avoid the id=3 DELETED comment
-- in `pub-with-deleted-comment`).

INSERT INTO comments
  (id_int, publication_id_int, version_id_int, user_id_int, body, parent_id_int, state, created_at, id)
VALUES
  (4, 1, 1, 1, 'Check out _this thing in italics_, my_variable_name and foo_bar, plus a [note] and 50% done.', NULL, 'PUBLISHED', '2026-01-15 14:30:00', '00000000050000000000000004');

INSERT INTO notifications (comment_id_int, comment_id, created_at, id_int, id, message, publication_id_int, publication_id, seen, state, user_id_int) VALUES
  (4, '00000000050000000000000004', '2025-12-04 20:13:41', 206, '0000000006000000000000006E', 'Alice commented: Check out _this thing in italics_, my_variable_name and foo_bar, plus a [note] and 50% done.', 1, '00000000030000000000000001', 0, 'COMMENT', 1);
