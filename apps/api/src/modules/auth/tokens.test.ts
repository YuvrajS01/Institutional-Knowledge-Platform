import { describe, expect, it } from 'vitest';

import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
  type TokenConfig,
} from './tokens.js';

const config: TokenConfig = {
  secret: 'unit-test-secret-0123456789-0123456789',
  accessTtlMinutes: 15,
  refreshTtlDays: 30,
};

describe('access tokens', () => {
  it('round-trips a signed token', async () => {
    const token = await signAccessToken('user-123', config);
    const { userId } = await verifyAccessToken(token, config.secret);
    expect(userId).toBe('user-123');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signAccessToken('user-123', config);
    await expect(
      verifyAccessToken(token, 'another-secret-0123456789-0123456789'),
    ).rejects.toThrow();
  });

  it('rejects a tampered token', async () => {
    const token = await signAccessToken('user-123', config);
    await expect(verifyAccessToken(`${token}x`, config.secret)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signAccessToken('user-123', { ...config, accessTtlMinutes: 0.001 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(verifyAccessToken(token, config.secret)).rejects.toThrow();
  });
});

describe('refresh tokens', () => {
  it('generates unique opaque tokens', () => {
    const first = generateRefreshToken();
    const second = generateRefreshToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
  });

  it('hashes deterministically and irreversibly', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
  });
});
