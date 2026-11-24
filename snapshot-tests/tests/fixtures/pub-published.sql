-- One PUBLISHED publication with a single version, owned by user id 1.
-- Depends on `users-basic` (for the owner FK). Stable ids: publication=1, version=1.

INSERT INTO publications (slug, latest_version_number, state, owner_id_int, license, created_at, id)
VALUES (
  'hello-stacks',
  1,
  'PUBLISHED',
  1,
  'CC BY',
  '2026-01-15 12:00:00',
  '00000000030000000000000001'
);

INSERT INTO versions (publication_id_int, version_number, title, subtitle, abstract, body, state, created_at, updated_at, id)
VALUES (
  1,
  1,
  'Hello, Stacks',
  'A first publication',
  'A short abstract for snapshot testing.',
  'Body content for snapshot testing.',
  'PUBLISHED',
  '2026-01-15 12:00:00',
  '2026-01-15 12:00:00',
  '00000000040000000000000001'
);
