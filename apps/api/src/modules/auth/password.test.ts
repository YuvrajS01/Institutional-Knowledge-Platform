import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('hashes a password that verifies successfully', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct password');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces distinct hashes for the same password', async () => {
    const first = await hashPassword('same password');
    const second = await hashPassword('same password');
    expect(first).not.toBe(second);
  });
});
