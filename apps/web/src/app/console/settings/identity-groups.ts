/**
 * Which instrument asks for which identity field.
 *
 * Kept out of the form component so the server page can count the same fields
 * the client renders — every export of a `'use client'` module is a client
 * reference, and a completeness figure computed from a different list than the
 * one on screen is the sort of thing nobody notices until it is wrong.
 */
export interface IdentityValues {
  legalName: string;
  tradeName: string;
  country: string;
  vatNumber: string;
  eoriNumber: string;
  lei: string;
  gln: string;
  gs1CompanyPrefix: string;
  contactEmail: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
}

export interface IdentityGroup {
  id: 'law' | 'reach' | 'registry' | 'customs';
  title: string;
  instrument: string;
  why: string;
  fields: Array<keyof IdentityValues>;
}

export const IDENTITY_GROUPS: IdentityGroup[] = [
  {
    id: 'law',
    title: 'Who you are in law',
    instrument: 'ESPR Art. 4 · ISO 3166-1',
    why: 'The responsible economic operator named on every passport you publish. A trading name is shown to shoppers where it differs; the legal name is what an authority will act on.',
    fields: ['legalName', 'tradeName', 'country'],
  },
  {
    id: 'reach',
    title: 'How an authority reaches you',
    instrument: 'Regulation (EU) 2019/1020 Art. 4',
    why: 'A product may not be placed on the Union market unless there is an operator inside it who can be contacted about it. This is that contact, published on the passport.',
    fields: [
      'contactEmail',
      'website',
      'addressLine1',
      'addressLine2',
      'addressCity',
      'addressRegion',
      'addressPostalCode',
      'addressCountry',
    ],
  },
  {
    id: 'registry',
    title: 'Registry and supply-chain identifiers',
    instrument: 'ISO 17442 · GS1',
    why: 'How machines find you. The EU DPP Registry prefers an LEI; GS1 identifiers are what mint the Digital Link URIs behind your QR codes.',
    fields: ['lei', 'gln', 'gs1CompanyPrefix'],
  },
  {
    id: 'customs',
    title: 'Tax and customs',
    instrument: 'Union Customs Code · VAT Directive',
    why: 'Not published on the passport. Held because a customs or market-surveillance enquiry will ask for them, and finding them in a filing cabinet on the day is worse.',
    fields: ['vatNumber', 'eoriNumber'],
  },
];

/** Fields in this group that carry a value. */
export function identityFilled(
  values: IdentityValues,
  fields: Array<keyof IdentityValues>,
): number {
  return fields.filter((field) => values[field].trim().length > 0).length;
}

/** Every identity field, across every group. */
export const IDENTITY_FIELDS: Array<keyof IdentityValues> = IDENTITY_GROUPS.flatMap(
  (group) => group.fields,
);
