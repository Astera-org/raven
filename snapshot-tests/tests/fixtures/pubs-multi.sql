-- Three PUBLISHED publications, each owned by a different user from
-- `users-multi`. Stable ids 1..3 for both publications and versions.
-- Distinctive title/abstract tokens let us exercise the FULLTEXT `q`
-- search filter without false positives:
--   pub 1 "neutron" -- id=1, owner alice, created 2026-01-15
--   pub 2 "phylogeny" -- id=2, owner bob,   created 2026-02-10
--   pub 3 "calorimetry" -- id=3, owner charlie, created 2026-03-05
--
-- Tags:
--   pub 1: biology, open-science
--   pub 2: biology
--   pub 3: chemistry
--
-- Composes on `users-multi`.

INSERT INTO publications
  (id_int, slug, latest_version_number, state, owner_id_int, license, created_at, id)
VALUES
  (1, 'neutron-paper',     1, 'PUBLISHED', 1, 'CC BY', '2026-01-15 12:00:00', '00000000030000000000000001'),
  (2, 'phylogeny-paper',   1, 'PUBLISHED', 2, 'CC BY', '2026-02-10 12:00:00', '00000000030000000000000002'),
  (3, 'calorimetry-paper', 1, 'PUBLISHED', 3, 'CC BY', '2026-03-05 12:00:00', '00000000030000000000000003');

INSERT INTO versions
  (id_int, publication_id_int, version_number, title, subtitle, abstract, body, state,
   created_at, updated_at, id)
VALUES
  (1, 1, 1, 'Neutron diffusion notes',  'v1',
   'A short abstract about neutron transport.',
   'Body about neutron diffusion.',
   'PUBLISHED', '2026-01-15 12:00:00', '2026-01-15 12:00:00', '00000000040000000000000001'),
  (2, 2, 1, 'Phylogeny of finches',     'v1',
   'A short abstract about phylogeny analyses.',
   'Body about phylogeny.',
   'PUBLISHED', '2026-02-10 12:00:00', '2026-02-10 12:00:00', '00000000040000000000000002'),
  (3, 3, 1, 'Calorimetry techniques',   'v1',
   'A short abstract about calorimetry methods.',
   'Body about calorimetry.',
   'PUBLISHED', '2026-03-05 12:00:00', '2026-03-05 12:00:00', '00000000040000000000000003');

INSERT INTO publication_tags (publication_id_int, tag) VALUES
  (1, 'biology'),
  (1, 'open-science'),
  (2, 'biology'),
  (3, 'chemistry');
