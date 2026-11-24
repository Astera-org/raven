-- Email/password sign-in now requires a verified email (REQUIRE_EMAIL_VERIFICATION).
-- Existing password users were never asked to verify, so mark them verified to keep
-- them from being locked out. Users created after this migration must verify.
UPDATE `users`
SET `email_verified` = TRUE
WHERE `email_verified` = FALSE
  AND (
    (`password` IS NOT NULL AND `password` <> '')
    OR `id` IN (SELECT `user_id` FROM `accounts` WHERE `provider_id` = 'credential')
  );
