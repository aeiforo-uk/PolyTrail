import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Transactional email.
 *
 * Three providers behind one function. The `file` provider is not a stub — it
 * is the default in development precisely because the most important emails
 * this product sends are the ones carrying a magic link, and a developer needs
 * to be able to read that link without configuring an SMTP server or leaking
 * invitations to a real inbox.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text is required. HTML is optional and must never carry information the text lacks. */
  text: string;
  html?: string;
  replyTo?: string;
}

type Provider = 'file' | 'smtp' | 'resend';

function provider(): Provider {
  const explicit = process.env.EMAIL_PROVIDER as Provider | undefined;
  if (explicit) return explicit;
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_URL) return 'smtp';
  return 'file';
}

function from(): string {
  return process.env.EMAIL_FROM ?? 'Polytrail <no-reply@polytrail.example>';
}

export interface SendResult {
  delivered: boolean;
  provider: Provider;
  /** Where to find the message when the file provider wrote it to disk. */
  path?: string;
  error?: string;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const chosen = provider();

  try {
    switch (chosen) {
      case 'resend':
        return await sendViaResend(message);
      case 'smtp':
        return await sendViaSmtp(message);
      default:
        return await writeToDisk(message);
    }
  } catch (error) {
    // Email failure must not take down the operation that triggered it. The
    // caller decides whether an undelivered invitation is fatal; most of the
    // time showing the link in the UI is the better recovery.
    console.error('[email] send failed', { to: redact(message.to), provider: chosen, error });
    return { delivered: false, provider: chosen, error: (error as Error).message };
  }
}

async function sendViaResend(message: EmailMessage): Promise<SendResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      reply_to: message.replyTo,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
  }
  return { delivered: true, provider: 'resend' };
}

async function sendViaSmtp(message: EmailMessage): Promise<SendResult> {
  // nodemailer is an optional dependency — only loaded when SMTP is configured,
  // so a deployment using Resend or the file provider does not carry it. The
  // dynamic specifier is built at runtime so TypeScript does not demand the
  // types for a package that may not be installed.
  const specifier = 'nodemailer';
  const loaded = (await import(/* webpackIgnore: true */ specifier).catch(() => null)) as
    | { createTransport: (url: string) => { sendMail: (m: unknown) => Promise<unknown> } }
    | { default: { createTransport: (url: string) => { sendMail: (m: unknown) => Promise<unknown> } } }
    | null;
  if (!loaded) {
    throw new Error('SMTP_URL is set but nodemailer is not installed. Run: pnpm add nodemailer');
  }
  const mailer = 'createTransport' in loaded ? loaded : loaded.default;
  const transport = mailer.createTransport(process.env.SMTP_URL!);
  await transport.sendMail({
    from: from(),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo,
  });
  return { delivered: true, provider: 'smtp' };
}

async function writeToDisk(message: EmailMessage): Promise<SendResult> {
  const dir = process.env.EMAIL_OUTBOX ?? join(process.cwd(), '.outbox');
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${message.to.replace(/[^a-z0-9]/gi, '_')}.txt`;
  const path = join(dir, name);
  await writeFile(
    path,
    [
      `To: ${message.to}`,
      `From: ${from()}`,
      `Subject: ${message.subject}`,
      message.replyTo ? `Reply-To: ${message.replyTo}` : null,
      '',
      message.text,
    ]
      .filter(Boolean)
      .join('\n'),
    'utf8',
  );
  console.info(`[email] written to ${path}`);
  return { delivered: true, provider: 'file', path };
}

function redact(address: string): string {
  const [user, domain] = address.split('@');
  return `${user?.slice(0, 2) ?? ''}***@${domain ?? ''}`;
}
