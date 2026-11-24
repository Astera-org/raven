import { getConfig } from "#src/config.js";
import { createHmac, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Unsubscribe token (HMAC-SHA256). Keep the format stable: links in emails
// that were already sent must keep working.
//
//   token   = base64url(payload) + "." + base64url(hmac_sha256(JWT_SECRET_KEY, payload))
//   payload = compact JSON {"email": ..., "type": ...}
//
// Both parts are base64url without padding. The MAC covers the payload bytes
// as received, so older tokens whose JSON escapes non-ASCII still verify.
// ---------------------------------------------------------------------------

export function generateUnsubscribeToken(
  email: string,
  notificationType: string
): string {
  const secret = getConfig().JWT_SECRET_KEY;
  const payload = JSON.stringify({ email, type: notificationType });
  const payloadBuf = Buffer.from(payload);
  const mac = createHmac("sha256", secret).update(payloadBuf).digest();

  const payloadB64 = payloadBuf.toString("base64url").replace(/=/g, "");
  const macB64 = mac.toString("base64url").replace(/=/g, "");
  return `${payloadB64}.${macB64}`;
}

export function decodeUnsubscribeToken(
  token: string
): { email: string; type: string } | null {
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return null;
  const payloadB64 = token.slice(0, dotIdx);
  const macB64 = token.slice(dotIdx + 1);

  const secret = getConfig().JWT_SECRET_KEY;
  try {
    const payloadBuf = Buffer.from(payloadB64, "base64url");
    const mac = Buffer.from(macB64, "base64url");
    const expectedMac = createHmac("sha256", secret)
      .update(payloadBuf)
      .digest();
    if (!timingSafeEqual(mac, expectedMac)) return null;
    return JSON.parse(payloadBuf.toString("utf-8"));
  } catch {
    return null;
  }
}
