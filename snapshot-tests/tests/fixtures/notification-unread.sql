-- One unread notification for alice (user_id_int = 1).
-- Composes on top of `users-basic`. No publication or comment FK needed.

INSERT INTO notifications (id_int, id, user_id_int, message, state, seen, created_at)
VALUES (201, '0000000006000000000000006B', 1, 'A new publication matching your interests was posted.', 'NEW_PUBLICATION', 0, '2026-01-16 09:00:00');
