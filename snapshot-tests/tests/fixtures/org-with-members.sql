-- Membership rows for the `arcadia-science` org.
-- Composes on top of `users-multi` + `org-arcadia` (org id = 1).
--   alice (id=1) is ADMIN
--   bob   (id=2) is a regular member

INSERT INTO org_user_map (org_id_int, user_id_int, roles, start_at, org_id, user_id)
VALUES
  (1, 1, 'ADMIN', '2026-01-01 00:00:00', '00000000020000000000000001', '00000000010000000000000001'),
  (1, 2, NULL,    '2026-01-02 00:00:00', '00000000020000000000000001', '00000000010000000000000002');
