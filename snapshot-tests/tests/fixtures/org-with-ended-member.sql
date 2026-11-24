-- Memberships exercising the end_at filter. Composes on `users-multi` +
-- `org-arcadia`.
--   alice (id=1) -- ADMIN, currently active
--   bob   (id=2) -- regular member, end_at in the past (should be excluded)
--   charlie (id=3) -- regular member, end_at in the future (should be included)

INSERT INTO org_user_map (org_id_int, user_id_int, roles, start_at, end_at)
VALUES
  (1, 1, 'ADMIN', '2026-01-01 00:00:00', NULL),
  (1, 2, NULL,    '2025-01-01 00:00:00', '2025-12-31 00:00:00'),
  (1, 3, NULL,    '2026-01-01 00:00:00', '2099-12-31 00:00:00');
