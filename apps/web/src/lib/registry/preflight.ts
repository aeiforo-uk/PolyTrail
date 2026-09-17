import { UPI_MAX_LENGTH, type RegistryRecord } from './types';
import type { VerificationLevel } from '@/lib/verification/types';

/**
 * Refuse to file an incomplete record, and say exactly what is missing.
 *
 * "Submission failed" is the least useful sentence a compliance tool can
 * produce. Every issue below names the field, the plain-language fix, and the
 * instrument that asks for it — because the person filling this in is usually
 * being asked for something they have never heard of, by a regulation they
 * have not read, and they are entitled to the citation.
 */

export interface ReadinessIssue {
  /** Dot-path into the record, so the console can link straight to the field. */
  field: string;
  label: string;
  detail: string;
  /** The regulation, standard or scheme that asks for it. */
  instrument: string;
}

export interface RegistryReadiness {
  /** False when any blocking issue stands. */
  ok: boolean;
  issues: ReadinessIssue[];
  /**
   * Things that would block a filing of record but do not block a rehearsal.
   * The eIDAS gate lives here: it is real, it is unimplemented, and pretending
   * otherwise would be the one failure mode this module exists to avoid.
   */
  advisories: ReadinessIssue[];
}

export interface ReadinessInput {
  record: RegistryRecord;
  /** Passport lifecycle status. Only a published passport has an address to register. */
  passportStatus: string;
  /** Where the operator has reached on the verification ladder. */
  verificationLevel: VerificationLevel;
  /** True when the configured client would file a registration of record. */
  authoritative: boolean;
}

const HS_CODE = /^\d{4,10}$/;

export function checkRegistryReadiness(input: ReadinessInput): RegistryReadiness {
  const { record } = input;
  const issues: ReadinessIssue[] = [];
  const advisories: ReadinessIssue[] = [];

  if (input.passportStatus !== 'published') {
    issues.push({
      field: 'status',
      label: 'Passport not published',
      detail:
        `This passport is ${input.passportStatus.replace(/_/g, ' ')}. The Registry stores the address of a ` +
        'passport a reader can open, so there is nothing to register until it is published.',
      instrument: 'ESPR (EU) 2024/1781 Art. 9 — the passport must be accessible',
    });
  }

  if (!record.upi) {
    issues.push({
      field: 'upi',
      label: 'No unique product identifier',
      detail:
        'Give the passport a resolvable address — a GS1 Digital Link built from a GTIN, or the passport URL itself.',
      instrument: 'EN 18219:2026 — permitted identifier schemes',
    });
  } else if (!isResolvableUrl(record.upi)) {
    issues.push({
      field: 'upi',
      label: 'The identifier is not a URL',
      detail:
        `“${truncate(record.upi, 80)}” is not an absolute http(s) URL. A bare UUID or a URN is not a valid ` +
        'unique product identifier: the Registry has to be able to fetch it.',
      instrument: 'EU DPP Registry — the UPI must be a resolvable URL',
    });
  } else if (record.upi.length > UPI_MAX_LENGTH) {
    issues.push({
      field: 'upi',
      label: 'The identifier is too long',
      detail: `${record.upi.length} characters. The Registry accepts at most ${UPI_MAX_LENGTH}.`,
      instrument: `EU DPP Registry — UPI limit of ${UPI_MAX_LENGTH} characters`,
    });
  }

  if (!record.commodityCode) {
    issues.push({
      field: 'commodityCode',
      label: 'No commodity code',
      detail:
        'Add the Combined Nomenclature code for this product on the passport’s identity section — ' +
        'for a knitted cotton jumper that is 6110 20, filed as 61102000.',
      instrument: 'Union Customs Code (EU) 952/2013 — Combined Nomenclature',
    });
  } else if (!HS_CODE.test(record.commodityCode)) {
    issues.push({
      field: 'commodityCode',
      label: 'The commodity code is not well formed',
      detail: `“${record.commodityCode}” is not 4 to 10 digits. Enter the digits only, with no spaces or dots.`,
      instrument: 'Union Customs Code (EU) 952/2013 — Combined Nomenclature',
    });
  }

  if (!record.operator.identifier) {
    issues.push({
      field: 'operator.identifier',
      label: 'No operator identifier',
      detail:
        'Record the workspace’s LEI in settings, or an EORI number if you do not hold one. The Registry ' +
        'files against the responsible economic operator, not against the brand name.',
      instrument: 'EU DPP Registry Art. 4 — responsible economic operator',
    });
  }

  if (!record.operator.country || record.operator.country.length !== 2) {
    issues.push({
      field: 'operator.country',
      label: 'No country of establishment',
      detail: 'Set the country of the establishment that places this product on the Union market.',
      instrument: 'Regulation (EU) 2019/1020 Art. 4 — economic operator in the Union',
    });
  }

  if (!record.serviceProviderReference) {
    issues.push({
      field: 'serviceProviderReference',
      label: 'No service-provider reference',
      detail:
        'Set REGISTRY_SERVICE_PROVIDER_REF, or configure the resolver base URL so one can be derived from it.',
      instrument: 'EU DPP Registry — DPP service provider identification',
    });
  }

  if (!record.versionHash || !record.payloadHash) {
    issues.push({
      field: 'versionHash',
      label: 'No version hash',
      detail:
        'The passport version has no content hash. Re-save the passport so a version is written, then file again.',
      instrument: 'EU DPP Registry — version identification',
    });
  }

  if (!record.identifierLinks.model && !record.identifierLinks.batch && !record.identifierLinks.item) {
    issues.push({
      field: 'identifierLinks',
      label: 'No resolvable links',
      detail: 'The record carries no address at any granularity, so nothing could be resolved from it.',
      instrument: 'EN 18219:2026 — identifier resolution',
    });
  }

  if (record.granularity === 'item' && !record.identifierLinks.item) {
    advisories.push({
      field: 'identifierLinks.item',
      label: 'Item-level passport without an item link',
      detail:
        'This passport is scoped to a single garment but carries no serial, so it will be registered at model ' +
        'level. Add a serial number (GS1 AI 21) to register the individual item.',
      instrument: 'JRC textile DPP study (13 May 2026) §granularity',
    });
  }

  // The hard gate nobody in this market mentions. Registry Art. 4 requires a
  // qualified electronic seal from a QTSP before an operator may file, valid
  // for up to three years. Polytrail models the ladder and stops short of
  // claiming a seal it has not obtained.
  if (input.verificationLevel !== 'qualified_seal') {
    const gate: ReadinessIssue = {
      field: 'operator.verification',
      label: 'Operator is not eIDAS verified',
      detail:
        `This workspace has reached “${input.verificationLevel.replace(/_/g, ' ')}”. Filing of record needs a ` +
        'qualified electronic seal from a qualified trust service provider. Polytrail models the step and ' +
        'does not yet obtain the seal — see Security for where the ladder stands.',
      instrument: 'EU DPP Registry Art. 4 — eIDAS qualified electronic seal',
    };
    if (input.authoritative) issues.push(gate);
    else advisories.push(gate);
  }

  return { ok: issues.length === 0, issues, advisories };
}

function isResolvableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
