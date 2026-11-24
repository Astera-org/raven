-- A multi-version PUBLISHED publication. v1 is older, v2 is the latest.
-- Composes on `users-basic`. Stable ids: pub=10, versions=10 (v1) & 11 (v2).
-- Distinct content per version so /v1 and /v2 produce different snapshots.

INSERT INTO publications
  (id_int, slug, latest_version_number, state, owner_id_int, license, created_at, id)
VALUES
  (10, 'multi-version', 2, 'PUBLISHED', 1, 'CC BY', '2026-01-01 00:00:00', '0000000003000000000000000A');

INSERT INTO versions
  (id_int, publication_id_int, version_number, title, subtitle, abstract, body, state,
   created_at, updated_at, id)
VALUES
  (10, 10, 1, 'Multi-Version v1', 'first',  'v1 abstract.', 'v1 body.',
   'PUBLISHED', '2026-01-01 00:00:00', '2026-01-01 00:00:00', '0000000004000000000000000A'),
  (11, 10, 2, 'Multi-Version v2', 'second', 'v2 abstract.', 'v2 body.',
   'PUBLISHED', '2026-02-01 00:00:00', '2026-02-01 00:00:00', '0000000004000000000000000B');
