import { z } from 'zod';
import { computeGtinCheckDigit } from '@/lib/gs1/digital-link';
import { PARTNER_ROLES, SUPPLY_TIERS, type PartnerRole, type SupplyTier } from './vocab';

const tiers = SUPPLY_TIERS.map((t) => t.value) as [SupplyTier, ...SupplyTier[]];
const roles = PARTNER_ROLES as readonly PartnerRole[] as [PartnerRole, ...PartnerRole[]];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);

/**
 * A GLN is a 13-digit GS1 key with a modulo-10 check digit, the same
 * arithmetic as a GTIN. Validating it here rather than trusting the paste is
 * worth the code: a transposed digit produces a syntactically plausible
 * identifier that silently points at somebody else's factory.
 */
export function isValidGln(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  return computeGtinCheckDigit(value.slice(0, 12)) === Number(value[12]);
}

const coordinate = (label: string, limit: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null)
    .refine(
      (v) => v === null || (Number.isFinite(Number(v)) && Math.abs(Number(v)) <= limit),
      `${label} must be a number between -${limit} and ${limit}.`,
    );

export const partnerInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the facility a name you will recognise.').max(255),
  legalName: optionalText(255),
  tier: z.enum(tiers, { message: 'Choose which tier this facility sits in.' }),
  roles: z
    .array(z.enum(roles))
    .min(1, 'Pick at least one role. It is what decides which questions this facility is asked.')
    .max(12),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code, e.g. PT for Portugal.'),
  line1: optionalText(200),
  line2: optionalText(200),
  city: optionalText(120),
  region: optionalText(120),
  postalCode: optionalText(32),
  latitude: coordinate('Latitude', 90),
  longitude: coordinate('Longitude', 180),
  gln: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null)
    .refine(
      (v) => v === null || isValidGln(v),
      'A GLN is 13 digits and its last digit is a check digit. This one does not add up.',
    ),
  osId: optionalText(32),
  lei: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null)
    .refine((v) => v === null || /^[0-9A-Z]{20}$/.test(v), 'An LEI is 20 characters, A–Z and 0–9.'),
  did: optionalText(512),
  contactName: optionalText(255),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null)
    .refine(
      (v) => v === null || z.email().safeParse(v).success,
      'That does not look like an email address.',
    ),
  workerCount: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .nullable()
    .default(null)
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= 0 && v < 10_000_000),
      'Worker count must be a whole number.',
    ),
  capabilities: z
    .string()
    .trim()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 40),
    ),
  notes: optionalText(4000),
});

export type PartnerInput = z.infer<typeof partnerInputSchema>;

/** Pull a partner form off a `FormData`, so a no-JS post and a fetch agree. */
export function partnerInputFromForm(form: FormData) {
  const text = (key: string) => String(form.get(key) ?? '');
  return partnerInputSchema.safeParse({
    name: text('name'),
    legalName: text('legalName'),
    tier: text('tier'),
    roles: form.getAll('roles').map(String).filter(Boolean),
    country: text('country'),
    line1: text('line1'),
    line2: text('line2'),
    city: text('city'),
    region: text('region'),
    postalCode: text('postalCode'),
    latitude: text('latitude'),
    longitude: text('longitude'),
    gln: text('gln'),
    osId: text('osId'),
    lei: text('lei'),
    did: text('did'),
    contactName: text('contactName'),
    contactEmail: text('contactEmail'),
    workerCount: text('workerCount'),
    capabilities: text('capabilities'),
    notes: text('notes'),
  });
}
