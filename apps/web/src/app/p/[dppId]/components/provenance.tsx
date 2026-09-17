import { ShieldCheck } from 'lucide-react';
import type { PassportPayload } from '@/lib/passport/schema';
import { CERTIFICATION_SCHEMES, type CertificationScheme } from '@/lib/passport/vocab';
import { Eyebrow, Row } from './section';
import { formatDate } from './care';

/**
 * Provenance and authenticity.
 *
 * Collapsed by default and written without a word of cryptographic vocabulary
 * above it. The hash and the issuer DID matter enormously to a verifier and
 * not at all to a shopper, so they live here, in monospace, ready to be
 * copied — and nowhere else on the page.
 */
export function ProvenanceSection({
  payload,
  dataHash,
  version,
  publishedAt,
  brand,
}: {
  payload: Partial<PassportPayload>;
  dataHash: string;
  version: number;
  publishedAt: string | null;
  brand: { name: string; did: string | null; country: string };
}) {
  const certifications = payload.certifications ?? [];
  const operator = payload.identity?.economicOperators?.[0];

  return (
    <div className="flex flex-col gap-9">
      {certifications.length > 0 ? (
        <div>
          <Eyebrow>Certifications</Eyebrow>
          <ul className="flex flex-col gap-3">
            {certifications.map((cert) => {
              const scheme = CERTIFICATION_SCHEMES[cert.scheme as CertificationScheme];
              const expired = cert.validUntil ? new Date(cert.validUntil) < new Date() : false;
              return (
                <li
                  key={cert.id}
                  className="flex items-start gap-3 rounded-md border border-line bg-surface p-3"
                >
                  <ShieldCheck
                    className={expired ? 'mt-0.5 size-4 text-ink-subtle' : 'mt-0.5 size-4 text-positive'}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {scheme?.label ?? cert.scheme}
                      {expired ? (
                        <span className="ml-2 text-xs font-normal text-caution">Expired</span>
                      ) : null}
                    </p>
                    {cert.scope ? (
                      <p className="mt-0.5 text-sm text-ink-muted">{cert.scope}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-subtle">
                      Issued by {cert.issuedBy}
                      {cert.validUntil ? ` · valid until ${formatDate(cert.validUntil)}` : ''}
                    </p>
                    {cert.licenceNumber ? (
                      <p className="mono mt-1 text-2xs text-ink-subtle">{cert.licenceNumber}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <Eyebrow>Who published this</Eyebrow>
        <Row label="Economic operator" value={operator?.name ?? brand.name} />
        {operator?.role ? (
          <Row label="Role" value={operator.role.replace(/_/g, ' ')} />
        ) : null}
        {operator?.lei ? (
          <Row label="Legal Entity Identifier" value={<span className="mono text-xs">{operator.lei}</span>} />
        ) : null}
        {operator?.email ? <Row label="Contact" value={operator.email} /> : null}
      </div>

      <div>
        <Eyebrow>This record</Eyebrow>
        <Row label="Passport version" value={`v${version}`} />
        <Row label="Published" value={formatDate(publishedAt)} />
        {brand.did ? (
          <Row label="Issuer identifier" value={<span className="mono text-2xs break-all">{brand.did}</span>} />
        ) : null}
        <Row
          label="Content fingerprint"
          value={<span className="mono text-2xs break-all">{dataHash.slice(0, 18)}…</span>}
        />
        <p className="mt-3 max-w-prose text-xs leading-relaxed text-ink-subtle">
          The fingerprint is a SHA-256 hash of this passport&rsquo;s contents in canonical form. If
          any value on this page changed, the fingerprint would change with it. The full value is in
          the machine-readable version linked at the foot of this page.
        </p>
      </div>
    </div>
  );
}
