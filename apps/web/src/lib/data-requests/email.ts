/**
 * The message a supplier actually receives.
 *
 * Written as plain text and kept short on purpose. The recipient is often a
 * production manager reading on a phone, in their second or third language,
 * and the single thing that decides whether this module works is whether they
 * understand what is being asked and click the link. Anything that reads like
 * a compliance notice gets ignored.
 *
 * Pure, so the composer can preview exactly what will be sent rather than an
 * approximation of it.
 */

export interface RequestEmailInput {
  brandName: string;
  partnerName: string;
  contactName?: string | null;
  title: string;
  message?: string | null;
  fieldCount: number;
  sectionLabels: readonly string[];
  dueAt?: Date | null;
  link: string;
  /** A reminder says so, rather than looking like a duplicate. */
  reminder?: boolean;
}

export interface RenderedEmail {
  subject: string;
  body: string;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function renderRequestEmail(input: RequestEmailInput): RenderedEmail {
  const subject = input.reminder
    ? `Reminder: ${input.brandName} needs ${input.fieldCount} details about what you supply`
    : `${input.brandName} needs ${input.fieldCount} details about what you supply`;

  const greeting = input.contactName ? `Hello ${input.contactName},` : `Hello,`;
  const topics = listOf(input.sectionLabels);

  const lines: Array<string | null> = [
    greeting,
    '',
    input.reminder
      ? `We wrote to ${input.partnerName} recently and have not had an answer yet. The link below still works.`
      : `${input.brandName} is building a Digital Product Passport for a product you help make, and needs ${input.fieldCount} ${input.fieldCount === 1 ? 'detail' : 'details'} from ${input.partnerName}.`,
    '',
    topics ? `What we are asking about: ${topics}.` : null,
    topics ? '' : null,
    input.message?.trim() ?? null,
    input.message?.trim() ? '' : null,
    'You do not need an account and there is nothing to install. Open this link and answer what you can:',
    '',
    input.link,
    '',
    input.dueAt
      ? `Please answer by ${dateFormat.format(input.dueAt)}. The link stops working two weeks after that.`
      : 'The link works for the next 60 days.',
    '',
    'Your answers go straight to the passport for this product. If a question does not apply to you, leave it blank and add a note at the end.',
    '',
    `— ${input.brandName}`,
  ];

  return { subject, body: lines.filter((line) => line !== null).join('\n') };
}

function listOf(items: readonly string[]): string {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}
