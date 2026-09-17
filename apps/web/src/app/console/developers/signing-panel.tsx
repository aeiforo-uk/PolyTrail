'use client';

import { useActionState } from 'react';
import { ArrowUpRight, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { rotateSigningKeyAction } from './actions';
import { CopyButton } from './api-keys-panel';

/**
 * The workspace's credential signing identity.
 *
 * Shown here rather than buried in settings because the DID is a public fact
 * about the brand that partners will be asked to trust, and because rotation is
 * a decision with a consequence worth stating on the same screen as the button.
 */
export function SigningPanel({
  did,
  keyId,
  algorithm,
  createdAt,
  didDocumentUrl,
}: {
  did: string;
  keyId: string | null;
  algorithm: string | null;
  createdAt: string | null;
  didDocumentUrl: string;
}) {
  const [state, action, pending] = useActionState(rotateSigningKeyAction, {});

  return (
    <section aria-labelledby="signing-heading">
      <div className="mb-3">
        <h2 id="signing-heading" className="text-sm font-semibold text-ink">
          Credential signing
        </h2>
        <p className="mt-0.5 max-w-prose text-sm text-ink-muted">
          Every verifiable credential this workspace issues is signed with one key, and verified
          against the public half of it published below. A verifier who cannot fetch that document
          cannot check your credentials at all.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {keyId ? (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
              <Badge tone="positive">
                <ShieldCheck aria-hidden />
                Active
              </Badge>
              <span className="mono text-xs text-ink">{algorithm}</span>
              <span className="text-xs text-ink-subtle">
                since {createdAt ? new Date(createdAt).toLocaleDateString('en-GB') : '—'}
              </span>
              <span
                className="mono ml-auto max-w-full truncate text-2xs text-ink-subtle"
                title={keyId}
              >
                {keyId}
              </span>
            </div>

            <dl className="flex flex-col gap-px bg-line">
              <div className="bg-surface px-5 py-4">
                <dt className="eyebrow">Issuer DID</dt>
                <dd className="mt-1.5 flex flex-wrap items-center gap-2">
                  <code className="mono min-w-0 flex-1 overflow-x-auto rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-ink select-all">
                    {did}
                  </code>
                  <CopyButton value={did} label="Copy DID" />
                </dd>
                <dd className="mt-1.5 max-w-prose text-xs text-ink-muted">
                  The identifier that appears as the issuer on every credential. Partners record
                  this, so it outlives any single key.
                </dd>
              </div>

              <div className="bg-surface px-5 py-4">
                <dt className="eyebrow">DID document</dt>
                <dd className="mt-1.5">
                  <a
                    href={didDocumentUrl}
                    className="mono inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {didDocumentUrl}
                    <ArrowUpRight className="size-3" aria-hidden />
                  </a>
                  <p className="mt-1.5 max-w-prose text-xs text-ink-muted">
                    Public, and necessarily so — a credential nobody can fetch the key for is a
                    credential nobody can verify. It carries public keys only, never the private
                    half.
                  </p>
                </dd>
              </div>
            </dl>

            {state.error ? (
              <p role="alert" className="border-t border-line px-5 py-3 text-sm text-critical">
                {state.error}
              </p>
            ) : null}
            {state.message ? (
              <p role="status" className="border-t border-line px-5 py-3 text-sm text-positive">
                {state.message}
              </p>
            ) : null}

            <form action={action} className="border-t border-line bg-surface-sunken/50 px-5 py-4">
              <p className="mb-2.5 max-w-prose text-xs leading-relaxed text-ink-muted">
                Rotating generates a new key and signs future credentials with it. Credentials
                already issued stay valid: the old public key remains in the DID document so they
                continue to verify. Rotate if you suspect the private key has been exposed, or on
                whatever schedule your own policy sets.
              </p>
              <Button type="submit" variant="secondary" size="sm" loading={pending}>
                Rotate signing key
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-start gap-3 px-5 py-6">
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
              <ShieldQuestion className="size-4.5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">No signing key yet</p>
              <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-muted">
                One is generated the first time this workspace issues a credential, and its public
                half is published at <span className="mono text-xs">{didDocumentUrl}</span> the same
                moment. There is nothing to set up and nothing to do now — issue a credential on any
                published passport and this panel fills itself in.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
