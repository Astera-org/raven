-- Multi-user fixture: three users with deterministic ids 1, 2, 3.
--   id=1 alice    ACTIVE
--   id=2 bob      ACTIVE
--   id=3 charlie  SITE_ADMIN  (used for admin-override test cases)
-- Composable building block. AUTO_INCREMENT resets after TRUNCATE.
-- id values follow the scheme documented in snapshot-tests/README.md:
--   entity digit 1, id in Crockford base32 → e.g. alice: 00000000010000000000000001

-- All three users have password `password123`, hashed with Werkzeug scrypt (N=32768, r=8, p=1).
INSERT INTO users (username, email, password, first_name, last_name, `name`, state, email_verified, created_at, id)
VALUES
  -- Passwords `password123`, hashed with Werkzeug scrypt (N=32768, r=8, p=1).
  ('alice',   'alice@example.com',
   'scrypt:32768:8:1$lJPIKIKHC6RSrwxU$3e4f8fe7ab3ebf6c454f0c6bb4cc7a91e423747c9c9891b614d7c9d373af51b791f18aa314bd7ef45ffe402525bc812a307412484f841802f08da302ef3f7d5a',
   'Alice',   'Example', 'Alice Example', 'ACTIVE',     TRUE, '2026-01-01 00:00:00', '00000000010000000000000001'),
  ('bob',     'bob@example.com',
   'scrypt:32768:8:1$ZrUeyheHhJtKKUt3$5bf20c99ad6d6ca40b281f519ea74ee7a5fdf0f291d58ea4a1638ea9782eb762e53dc759bc5770daa7e44c1535d5d3ac5b2f88ad59c056d671b9c9fbcc861cec',
   'Bob',     'Example', 'Bob Example',   'ACTIVE',     TRUE, '2026-01-02 00:00:00', '00000000010000000000000002'),
  ('charlie', 'charlie@example.com',
   'scrypt:32768:8:1$WtErFBDWnP1h1wha$4d15d639c7699e635e62dfbf4734782cb326f410e254d9eabef8f33907be632b70146c1acc18f757848fad12cb21e81e69a754d2e71b7d59fdb0b633a8ea7e9f',
   'Charlie', 'Admin', 'Charlie Admin',   'SITE_ADMIN', TRUE, '2026-01-03 00:00:00', '00000000010000000000000003');

INSERT INTO `accounts` (`id`, `account_id`, `provider_id`, `user_id`, `password`, `updated_at`)
VALUES
  (
    '00000000080000000000000001',
    '00000000010000000000000001',
    'credential',
    '00000000010000000000000001',
    'scrypt:32768:8:1$lJPIKIKHC6RSrwxU$3e4f8fe7ab3ebf6c454f0c6bb4cc7a91e423747c9c9891b614d7c9d373af51b791f18aa314bd7ef45ffe402525bc812a307412484f841802f08da302ef3f7d5a',
    '2026-07-06 01:23:45.678'
  ),
  (
    '00000000080000000000000002',
    '00000000010000000000000002',
    'credential',
    '00000000010000000000000002',
    'scrypt:32768:8:1$ZrUeyheHhJtKKUt3$5bf20c99ad6d6ca40b281f519ea74ee7a5fdf0f291d58ea4a1638ea9782eb762e53dc759bc5770daa7e44c1535d5d3ac5b2f88ad59c056d671b9c9fbcc861cec',
    '2026-07-06 01:23:46.678'
  ),
  (
    '00000000080000000000000003',
    '00000000010000000000000003',
    'credential',
    '00000000010000000000000003',
    'scrypt:32768:8:1$WtErFBDWnP1h1wha$4d15d639c7699e635e62dfbf4734782cb326f410e254d9eabef8f33907be632b70146c1acc18f757848fad12cb21e81e69a754d2e71b7d59fdb0b633a8ea7e9f',
    '2026-07-06 01:23:47.678'
  );