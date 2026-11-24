import { sql } from "drizzle-orm";
import { type MySql2Database } from "drizzle-orm/mysql2";
import type mysql from "mysql2/promise";

/**
 * This file adds ULID functions to the MySQL database. These functions are used
 * to encode and decode ULIDs, as well as convert between ULIDs and datetime
 * values.
 *
 * The functions are sourced from:
 * - https://gist.github.com/kenji4569/47ce8bbd6bef7b85ba1f97e018f34cf3
 *
 * The functions added are:
 * - ULID_DECODE: Decodes a ULID string into a binary representation.
 * - ULID_ENCODE: Encodes a binary representation into a ULID string.
 * - ULID_FROM_DATETIME: Generates a ULID from a given datetime value.
 * - ULID_TO_DATETIME: Converts a ULID string back to its corresponding datetime
 *   value.
 */

/**
 * Adds ULID functions to the MySQL database.
 *
 * @remarks
 * This function drops any existing ULID functions and creates new ones.
 *
 * @param db - The MySQL database instance to which the ULID functions will be
 * added.
 */
export async function addUlidFunctions(
  db: MySql2Database<Record<string, never>> & {
    $client: mysql.Connection;
  }
) {
  await db.execute(dropUlidDecodeFunction());
  await db.execute(createUlidDecodeFunction());

  await db.execute(dropUlidEncodeFunction());
  await db.execute(createUlidEncodeFunction());

  await db.execute(dropUlidFromDatetimeFunction());
  await db.execute(createUlidFromDatetimeFunction());

  await db.execute(dropUlidToDatetimeFunction());
  await db.execute(createUlidToDatetimeFunction());

  await db.execute(dropUlidFunction());
  await db.execute(createUlidFunction());
}

/**
 * Drops the ULID_DECODE function if it exists.
 *
 * @returns A SQL statement to drop the ULID_DECODE function.
 */
function dropUlidDecodeFunction() {
  return sql`DROP FUNCTION IF EXISTS ULID_DECODE`;
}

/**
 * Creates the ULID_DECODE function, which decodes a ULID string into a binary
 * representation.
 *
 * @returns A SQL statement to create the ULID_DECODE function.
 */
function createUlidDecodeFunction() {
  return sql`
    CREATE FUNCTION ULID_DECODE (s CHAR(26)) RETURNS BINARY(16) DETERMINISTIC
    BEGIN
      DECLARE s_base32 CHAR(26);
      SET s_base32 = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(s), 'J', 'I'), 'K', 'J'), 'M', 'K'), 'N', 'L'), 'P', 'M'), 'Q', 'N'), 'R', 'O'), 'S', 'P'), 'T', 'Q'), 'V', 'R'), 'W', 'S'), 'X', 'T'), 'Y', 'U'), 'Z', 'V');
      RETURN UNHEX(CONCAT(LPAD(CONV(SUBSTRING(s_base32, 1, 2), 32, 16), 2, '0'), LPAD(CONV(SUBSTRING(s_base32, 3, 12), 32, 16), 15, '0'), LPAD(CONV(SUBSTRING(s_base32, 15, 12), 32, 16), 15, '0')));
    END
  `;
}

/**
 * Drops the ULID_ENCODE function if it exists.
 *
 * @returns A SQL statement to drop the ULID_ENCODE function.
 */
function dropUlidEncodeFunction() {
  return sql`DROP FUNCTION IF EXISTS ULID_ENCODE`;
}

/**
 * Creates the ULID_ENCODE function, which encodes a binary representation
 * into a ULID string.
 *
 * @returns A SQL statement to create the ULID_ENCODE function.
 */
function createUlidEncodeFunction() {
  return sql`
    CREATE FUNCTION ULID_ENCODE (b BINARY(16)) RETURNS CHAR(26) DETERMINISTIC
    BEGIN
      DECLARE s_hex CHAR(32);
      SET s_hex = LPAD(HEX(b), 32, '0');
      RETURN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CONCAT(LPAD(CONV(SUBSTRING(s_hex, 1, 2), 16, 32), 2, '0'), LPAD(CONV(SUBSTRING(s_hex, 3, 15), 16, 32), 12, '0'), LPAD(CONV(SUBSTRING(s_hex, 18, 15), 16, 32), 12, '0')), 'V', 'Z'), 'U', 'Y'), 'T', 'X'), 'S', 'W'), 'R', 'V'), 'Q', 'T'), 'P', 'S'), 'O', 'R'), 'N', 'Q'), 'M', 'P'), 'L', 'N'), 'K', 'M'), 'J', 'K'), 'I', 'J');
    END
  `;
}

/**
 * Drops the ULID_FROM_DATETIME function if it exists.
 *
 * @returns A SQL statement to drop the ULID_FROM_DATETIME function.
 */
function dropUlidFromDatetimeFunction() {
  return sql`DROP FUNCTION IF EXISTS ULID_FROM_DATETIME`;
}

/**
 * Creates the ULID_FROM_DATETIME function, which generates a ULID from a
 * DATETIME value, using the provided datetime and random bytes.
 *
 * @remarks
 * This function uses `RANDOM_BYTES(10)` to generate the random component in the
 * database. In most cases in this repository we should use the TypeScript
 * `ulid` library to generate ULIDs in application code, but this function is
 * provided for completeness and for use in database migrations.
 *
 * @returns A SQL statement to create the ULID_FROM_DATETIME function.
 */
function createUlidFromDatetimeFunction() {
  return sql`
    CREATE FUNCTION ULID_FROM_DATETIME (t DATETIME(3)) RETURNS CHAR(26) NOT DETERMINISTIC NO SQL
    BEGIN
      RETURN ULID_ENCODE(
        CONCAT(
          UNHEX(LPAD(CONV(CAST(UNIX_TIMESTAMP(t) * 1000 AS UNSIGNED), 10, 16), 12, '0')),
          RANDOM_BYTES(10)
        )
      );
    END
  `;
}

/**
 * Drops the ULID_TO_DATETIME function if it exists.
 *
 * @returns A SQL statement to drop the ULID_TO_DATETIME function.
 */
function dropUlidToDatetimeFunction() {
  return sql`DROP FUNCTION IF EXISTS ULID_TO_DATETIME`;
}

/**
 * Creates the ULID_TO_DATETIME function, which converts a ULID string back to
 * its corresponding DATETIME value.
 *
 * @returns A SQL statement to create the ULID_TO_DATETIME function.
 */
function createUlidToDatetimeFunction() {
  return sql`
    CREATE FUNCTION ULID_TO_DATETIME (s CHAR(26)) RETURNS DATETIME(3) DETERMINISTIC
    BEGIN
      RETURN FROM_UNIXTIME(
        CAST(CONV(HEX(LEFT(ULID_DECODE(s), 6)), 16, 10) AS UNSIGNED) / 1000
      );
    END
  `;
}

/**
 * Drops the ULID function if it exists.
 *
 * @returns A SQL statement to drop the ULID function.
 */
function dropUlidFunction() {
  return sql`DROP FUNCTION IF EXISTS ULID`;
}

/**
 * Creates the ULID function, which generates a ULID based on the current
 * datetime and random bytes.
 *
 * @returns A SQL statement to create the ULID function.
 */
function createUlidFunction() {
  return sql`
    CREATE FUNCTION ULID () RETURNS CHAR(26) NOT DETERMINISTIC NO SQL
    BEGIN
      RETURN ULID_FROM_DATETIME(NOW(3));
    END
  `;
}
