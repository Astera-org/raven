-- One ACTIVE organization. Stable id = 1 after TRUNCATE.
-- `unlisted = FALSE` so it shows up in sitemaps.

INSERT INTO organizations (name, slug, state, unlisted, created_at, updated_at, id)
VALUES (
  'Arcadia Science',
  'arcadia-science',
  'ACTIVE',
  FALSE,
  '2026-01-01 00:00:00',
  '2026-01-01 00:00:00',
  '00000000020000000000000001'
);
