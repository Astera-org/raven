import { getConfig } from "#src/config.js";
import { SignJWT, jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function getSecret(): Uint8Array {
  const key = getConfig().JWT_SECRET_KEY;
  return new TextEncoder().encode(key);
}

export async function generateAccessToken(userId: number): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

export async function generateRefreshToken(userId: number): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ sub: String(userId), type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function generateTokens(
  userId: number
): Promise<{ access_token: string; refresh_token: string }> {
  const [access_token, refresh_token] = await Promise.all([
    generateAccessToken(userId),
    generateRefreshToken(userId),
  ]);
  return { access_token, refresh_token };
}

export async function verifyToken(
  token: string
): Promise<{ sub: string; type?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { sub: string; type?: string };
  } catch {
    return null;
  }
}
