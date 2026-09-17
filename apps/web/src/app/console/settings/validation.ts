import { z } from 'zod';

/**
 * Workspace identity.
 *
 * These are the identifiers a passport cites as its responsible economic
 * operator, so they are validated to their standards rather than to "looks
 * about right". A wrong LEI on a published passport is a compliance defect,
 * and the cheapest place to catch it is the form.
 */

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value));

/** ISO 17442: 20 alphanumeric characters, the last two a check digit pair. */
const lei = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => value === '' || /^[A-Z0-9]{18}[0-9]{2}$/.test(value), {
    message: 'An LEI is exactly 20 characters: 18 letters or digits, then two check digits.',
  })
  .transform((value) => (value === '' ? null : value));

/** GS1 GLN: 13 digits, last one a mod-10 check digit. */
const gln = z
  .string()
  .trim()
  .refine((value) => value === '' || (/^\d{13}$/.test(value) && gs1CheckDigitOk(value)), {
    message: 'A GLN is 13 digits and ends in a valid GS1 check digit.',
  })
  .transform((value) => (value === '' ? null : value));

export const workspaceIdentitySchema = z.object({
  legalName: z.string().trim().min(1, 'The registered legal name is required.').max(255),
  tradeName: optional(255),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter ISO 3166-1 code, e.g. PT for Portugal.'),
  vatNumber: optional(64),
  eoriNumber: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || /^[A-Z]{2}[A-Z0-9]{1,15}$/.test(value), {
      message: 'An EORI starts with a two-letter country code, e.g. DE123456789012345.',
    })
    .transform((value) => (value === '' ? null : value)),
  lei,
  gln,
  gs1CompanyPrefix: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{6,12}$/.test(value), {
      message: 'A GS1 company prefix is between 6 and 12 digits.',
    })
    .transform((value) => (value === '' ? null : value)),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === '' || z.email().safeParse(value).success, {
      message: 'Enter a valid email address.',
    })
    .transform((value) => (value === '' ? null : value)),
  website: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => value === '' || /^https?:\/\/\S+$/.test(value), {
      message: 'Include the scheme, e.g. https://yourbrand.com.',
    })
    .transform((value) => (value === '' ? null : value)),
  addressLine1: optional(255),
  addressLine2: optional(255),
  addressCity: optional(255),
  addressRegion: optional(255),
  addressPostalCode: optional(32),
  addressCountry: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || /^[A-Z]{2}$/.test(value), {
      message: 'Use a two-letter ISO 3166-1 code.',
    })
    .transform((value) => (value === '' ? null : value)),
});

export type WorkspaceIdentityInput = z.input<typeof workspaceIdentitySchema>;
export type WorkspaceIdentity = z.output<typeof workspaceIdentitySchema>;

/** GS1 mod-10: weights alternate 3 and 1 from the right, excluding the check digit. */
function gs1CheckDigitOk(value: string): boolean {
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += digits[i]! * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}
