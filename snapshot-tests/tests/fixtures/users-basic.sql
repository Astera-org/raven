-- Minimal user fixture: one ACTIVE user. Composable building block.
-- AUTO_INCREMENT resets after TRUNCATE, so user id will be 1.

INSERT INTO users (username, email, password, first_name, last_name, `name`, state, email_verified, id)
VALUES (
  'alice',
  'alice@example.com',
  -- Password `password123`, hashed with Werkzeug scrypt (N=32768, r=8, p=1).
  'scrypt:32768:8:1$lJPIKIKHC6RSrwxU$3e4f8fe7ab3ebf6c454f0c6bb4cc7a91e423747c9c9891b614d7c9d373af51b791f18aa314bd7ef45ffe402525bc812a307412484f841802f08da302ef3f7d5a',
  'Alice',
  'Example',
  'Alice Example',
  'ACTIVE',
  TRUE,
  '00000000010000000000000001'
);

INSERT INTO `accounts` (`id`, `account_id`, `provider_id`, `user_id`, `password`, `updated_at`)
VALUES (
  '00000000080000000000000001',
  '00000000010000000000000001',
  'credential',
  '00000000010000000000000001',
  'scrypt:32768:8:1$TU6AQaqaGUS8vaYk$514900f74569e3c639151e6d1cb7e4fa950b57600ad1651971fd4d6dbd115febc70c8aa4c26404951d85e16c11ffc54ce8f947e515a1c0cd3a8d8e63e2deeabd',
  '2026-07-06 01:23:45.678'
);
