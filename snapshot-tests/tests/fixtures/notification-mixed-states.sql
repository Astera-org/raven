-- Two more alice-owned notifications with states other than COMMENT, for
-- exercising the `state` filter/scoping and the /notifications/types
-- endpoint. Composes on top of any `users-*` fixture that assigns alice
-- id=1 (e.g. `users-multi`). No publication or comment FK needed.
--   id=210 NEW_PUBLICATION
--   id=211 REPLY

INSERT INTO notifications (id_int, id, user_id_int, message, state, seen, created_at)
VALUES
  (210, '0000000006000000000000006J', 1, 'A new publication matching your interests was posted.', 'NEW_PUBLICATION', 0, '2026-01-16 09:00:00'),
  (211, '0000000006000000000000006K', 1, 'Someone replied to your comment.', 'REPLY', 0, '2026-01-16 10:00:00');
