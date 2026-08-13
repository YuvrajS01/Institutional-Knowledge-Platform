import { createHash, randomBytes } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

export interface TokenConfig {
  secret: string;
  accessTtlMinutes: number;
  refreshTtlDays: number;
}

const ALGORITHM = 'HS256';

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(userId: string, config: TokenConfig): Promise<string> {
  return new SignJWT({ type: 'access' })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTtlMinutes}m`)
    .sign(secretKey(config.secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, secretKey(secret));
  if (payload.type !== 'access' || !payload.sub) {
    throw new Error('Invalid access token payload.');
  }
  return { userId: payload.sub };
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(refreshTtlDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + refreshTtlDays * 24 * 60 * 60 * 1000);
}
