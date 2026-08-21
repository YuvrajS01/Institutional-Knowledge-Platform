import { describe, expect, it } from 'vitest';

import { createEmailAdapter, MockEmailAdapter, SmtpEmailAdapter } from './email-adapter.js';

describe('EmailAdapter (P7-004)', () => {
  it('Mock adapter records sent emails', async () => {
    const adapter = new MockEmailAdapter();
    expect(adapter.isConfigured()).toBe(false);
    const result = await adapter.send({
      to: 'student@example.edu',
      subject: 'Test',
      text: 'Hello',
    });
    expect(result.messageId).toMatch(/^mock-/);
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.to).toBe('student@example.edu');
  });

  it('Smtp adapter without config falls back to mock', async () => {
    const adapter = new SmtpEmailAdapter({});
    // Without env, it should not be configured
    expect(adapter.isConfigured()).toBe(false);
    const result = await adapter.send({ to: 'a@b.com', subject: 'Hi', text: 'Body' });
    expect(result.messageId).toMatch(/^mock-fallback-/);
  });

  it('createEmailAdapter returns Mock when not configured', () => {
    const originalHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    const adapter = createEmailAdapter();
    expect(adapter).toBeInstanceOf(MockEmailAdapter);
    if (originalHost) process.env.SMTP_HOST = originalHost;
  });

  it('creates Smtp adapter when env is set', () => {
    const originalHost = process.env.SMTP_HOST;
    const originalPort = process.env.SMTP_PORT;
    const originalUser = process.env.SMTP_USER;
    const originalPass = process.env.SMTP_PASS;
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    const adapter = createEmailAdapter();
    // It will be SmtpEmailAdapter, but isConfigured may be false if nodemailer not installed
    expect(adapter).toBeInstanceOf(SmtpEmailAdapter);
    process.env.SMTP_HOST = originalHost;
    process.env.SMTP_PORT = originalPort;
    process.env.SMTP_USER = originalUser;
    process.env.SMTP_PASS = originalPass;
    if (originalHost === undefined) delete process.env.SMTP_HOST;
    if (originalPort === undefined) delete process.env.SMTP_PORT;
    if (originalUser === undefined) delete process.env.SMTP_USER;
    if (originalPass === undefined) delete process.env.SMTP_PASS;
  });
});
