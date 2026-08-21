export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

export interface EmailAdapter {
  send(options: EmailOptions): Promise<{ messageId: string }>;
  isConfigured(): boolean;
}

/**
 * Mock email adapter (P7-004) — logs to console and pretends to send.
 * Used for tests and when SMTP is not configured.
 */
export class MockEmailAdapter implements EmailAdapter {
  public sent: EmailOptions[] = [];

  isConfigured(): boolean {
    return false;
  }

  async send(options: EmailOptions): Promise<{ messageId: string }> {
    this.sent.push(options);
    return { messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

/**
 * SMTP email adapter (P7-004) — uses nodemailer when available.
 * Falls back to Mock when nodemailer is not installed or SMTP not configured.
 */
export class SmtpEmailAdapter implements EmailAdapter {
  private readonly from: string;
  private readonly transporter: unknown | null = null;
  private readonly isConfiguredFlag: boolean;

  constructor(
    options: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
      from?: string;
    } = {},
  ) {
    const host = options.host ?? process.env.SMTP_HOST;
    const port =
      options.port ?? (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined);
    const user = options.user ?? process.env.SMTP_USER;
    const pass = options.pass ?? process.env.SMTP_PASS;
    this.from = options.from ?? process.env.EMAIL_FROM ?? 'noreply@institution.example';

    this.isConfiguredFlag = Boolean(host && port && user && pass);

    if (this.isConfiguredFlag) {
      try {
        // Lazy import to avoid hard dependency when not configured
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodemailer = require('nodemailer') as {
          createTransport: (opts: unknown) => unknown;
        };
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: options.secure ?? port === 465,
          auth: { user, pass },
        });
      } catch {
        this.transporter = null;
      }
    }
  }

  isConfigured(): boolean {
    return this.isConfiguredFlag && Boolean(this.transporter);
  }

  async send(options: EmailOptions): Promise<{ messageId: string }> {
    if (!this.transporter) {
      // Fallback to mock behavior when not configured
      return { messageId: `mock-fallback-${Date.now()}` };
    }
    const transporter = this.transporter as {
      sendMail: (opts: unknown) => Promise<{ messageId: string }>;
    };
    const result = await transporter.sendMail({
      from: options.from ?? this.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return { messageId: result.messageId ?? `smtp-${Date.now()}` };
  }
}

export function createEmailAdapter(): EmailAdapter {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    return new SmtpEmailAdapter();
  }
  return new MockEmailAdapter();
}
