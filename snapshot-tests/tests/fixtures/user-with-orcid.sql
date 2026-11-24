-- A user with an ORCID set, used to exercise the /users/match identifier
-- kinds (orcid). Stable id=4 to avoid colliding with `users-multi` (1..3).
-- Composes on `users-multi`.

INSERT INTO users
  (id_int, username, email, password, first_name, last_name, `name`, orcid, state, email_verified, created_at, id)
VALUES
  (4, 'dave', 'dave@example.com',
   'pbkdf2:sha256:260000$placeholder$0000000000000000000000000000000000000000000000000000000000000000',
   'Dave', 'Researcher', 'Dave Researcher', '0000-0001-2345-6789', 'ACTIVE', TRUE, '2026-01-04 00:00:00',
   '00000000010000000000000004');

INSERT INTO `accounts` (`id`, `account_id`, `provider_id`, `user_id`, `password`, `updated_at`)
VALUES (
  '00000000080000000000000004',
  '00000000010000000000000004',
  'credential',
  '00000000010000000000000004',
  'pbkdf2:sha256:260000$placeholder$0000000000000000000000000000000000000000000000000000000000000000',
  '2026-07-06 01:23:45.678'
);
