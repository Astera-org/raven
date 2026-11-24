-- One ACTIVE but UNLISTED organization. Sitemap and other public listings
-- should exclude this org. Stable id=2 to avoid colliding with
-- `org-arcadia.sql` (id_int=1).

INSERT INTO organizations (id_int, name, slug, state, unlisted, created_at, updated_at, id)
VALUES (
  2,
  'Stealth Lab',
  'stealth-lab',
  'ACTIVE',
  TRUE,
  '2026-01-01 00:00:00',
  '2026-01-01 00:00:00',
  '00000000020000000000000002'
);
