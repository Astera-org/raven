---
description: Delete or anonymize a user account with SQL.
---

# Delete a user account

These steps delete or anonymize an account for someone who has only commented, following the [account deletion guidelines](../admins/account-deletion.md).
You run them as SQL against the database.

## Steps

1. Back up the database.

2. Find the user and note their `id_int`:

   ```sql
   SELECT id, id_int, username, email FROM users WHERE last_name = '<last name>';
   ```

3. Check what they've contributed:

   ```sql
   SELECT * FROM comments WHERE user_id_int = <id_int>;
   SELECT * FROM contributors WHERE user_id_int = <id_int>;
   SELECT * FROM contributors_legacy WHERE user_id_int = <id_int>;
   SELECT * FROM publications WHERE owner_id_int = <id_int>;
   SELECT * FROM org_user_map WHERE user_id_int = <id_int>;
   ```

4. If all of these are empty, delete the user.
   Sessions, logins, notifications, and follows are deleted with it.

   ```sql
   DELETE FROM users WHERE id_int = <id_int>;
   ```

5. Otherwise, anonymize the user and remove their logins.
   Use a timestamp so the username and email stay unique.

   ```sql
   UPDATE users SET
     username = 'del202604222355',
     email = 'deleted+202604222355@thestacks.org',
     name = 'DELETED', first_name = 'DELETED', last_name = 'DELETED',
     orcid = NULL, profile = NULL, image = NULL,
     state = 'DELETED'
   WHERE id_int = <id_int>;

   DELETE FROM sessions WHERE user_id = '<id>';
   DELETE FROM accounts WHERE user_id = '<id>';
   ```
