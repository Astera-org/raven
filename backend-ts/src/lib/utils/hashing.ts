import { verifyPassword as verifyBetterAuthHash } from "better-auth/crypto";
import {
  pbkdf2 as pbkdf2cb,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2cb);
const scrypt = (
  password: Parameters<typeof scryptCb>[0],
  salt: Parameters<typeof scryptCb>[1],
  keylen: number,
  options: Parameters<typeof scryptCb>[3] & object
): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    })
  );

// ---------------------------------------------------------------------------
// Password hashing — Werkzeug PBKDF2-SHA256 compatible
// ---------------------------------------------------------------------------
// Werkzeug format: pbkdf2:sha256:<iterations>$<salt_hex>$<hash_hex>

/**
 * @deprecated Use better-auth's `hashPassword` instead. For backwards
 * compatibility with pre-better-auth passwords that are still in the database
 * we keep this function, but only to verify before migrating the password
 * to the better-auth hasher.
 *
 * @param {string} plain Unhashed password to hash
 * @returns {Promise<string>} The hashed password in Werkzeug PBKDF2-SHA256 format
 */
export async function hashPassword(plain: string): Promise<string> {
  const iterations = 260000;
  const salt = randomBytes(16).toString("hex");
  const dk = await pbkdf2(plain, salt, iterations, 32, "sha256");
  return `pbkdf2:sha256:${iterations}$${salt}$${dk.toString("hex")}`;
}

/**
 * @deprecated Use better-auth's `verifyPassword` instead. For backwards
 * compatibility with pre-better-auth passwords that are still in the database
 * we keep this function, but only to verify before migrating the password
 * to the better-auth verifier.
 *
 * @param {string} plain Unhashed password to verify
 * @param {string} stored Hashed password to verify against
 * @returns {Promise<boolean>} Whether the password matches the stored hash
 */
export async function verifyPassword(
  plain: string,
  stored: string
): Promise<boolean> {
  if (!stored) return false;

  // Werkzeug format
  if (stored.startsWith("pbkdf2:")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const [methodAndIter, salt, expectedHex] = parts as [
      string,
      string,
      string,
    ];
    const iterStr = methodAndIter.split(":")[2];
    if (!iterStr) return false;
    const iterations = parseInt(iterStr, 10);
    if (isNaN(iterations) || iterations <= 0) return false;

    try {
      const dk = await pbkdf2(
        plain,
        salt,
        iterations,
        expectedHex.length / 2,
        "sha256"
      );
      const expected = Buffer.from(expectedHex, "hex");
      const actual = Buffer.from(dk.toString("hex"), "hex");
      if (expected.length !== actual.length) return false;
      return timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }

  // Werkzeug scrypt format: scrypt:<N>:<r>:<p>$<salt_b64url>$<hash_hex>
  if (stored.startsWith("scrypt:")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const [methodStr, saltB64, expectedHex] = parts as [string, string, string];
    const methodParts = methodStr.split(":");
    if (methodParts.length !== 4) return false;
    const N = parseInt(methodParts[1]!, 10);
    const r = parseInt(methodParts[2]!, 10);
    const p = parseInt(methodParts[3]!, 10);

    if (![N, r, p].every((v) => Number.isSafeInteger(v) && v > 0)) return false;
    if (expectedHex.length % 2 !== 0) return false;
    const keylen = expectedHex.length / 2;

    try {
      const salt = Buffer.from(saltB64, "utf-8");
      const maxmem = 128 * N * r * (p + 2);
      if (!Number.isFinite(maxmem) || maxmem <= 0) {
        return false;
      }

      const dk = await scrypt(plain, salt, keylen, { N, r, p, maxmem });
      const expected = Buffer.from(expectedHex, "hex");
      if (expected.length !== dk.length) return false;
      return timingSafeEqual(expected, dk);
    } catch {
      return false;
    }
  }

  // Not a Werkzeug hash — assume it's one of better-auth's own hashes,
  // written by an auth2 registration or password change.
  try {
    return await verifyBetterAuthHash({ hash: stored, password: plain });
  } catch {
    return false;
  }
}
