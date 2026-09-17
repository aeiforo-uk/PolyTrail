'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Plus,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { API_SCOPES, SCOPE_DESCRIPTIONS, SCOPE_LABELS } from '@/lib/api-keys/scopes';
import type { ApiKeySummary } from '@/lib/api-keys/service';
import { cn } from '@/lib/utils';
import { createApiKeyAction, revokeApiKeyAction, type CreateKeyState } from './actions';

const DAY = 24 * 60 * 60 * 1000;

/** A key expiring inside this window is worth saying so about. */
const EXPIRY_WARNING_DAYS = 30;

/**
 * API keys.
 *
 * The secret is shown once, and the moment is built to be impossible to miss:
 * a dialog that cannot be dismissed by pressing escape, clicking away or
 * pressing a close button, and whose only exit is a checkbox saying the key has
 * been saved. Products that flash a key in a toast produce a steady trickle of
 * support tickets from people who blinked — and, worse, teach users that keys
 * are recoverable, which is the opposite of the property that makes them safe.
 */
export function ApiKeysPanel({ keys, origin }: { keys: ApiKeySummary[]; origin: string }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKeyAction, {});

  // Close the form only once a key actually came back, so a validation error
  // leaves the dialog open with the values still in it.
  useEffect(() => {
    if (state.key) {
      setOpen(false);
      setDismissed(false);
    }
  }, [state.key]);

  const now = Date.now();
  const live = keys.filter(
    (key) => key.revokedAt === null && (key.expiresAt === null || key.expiresAt.getTime() > now),
  );
  const expiringSoon = live.filter(
    (key) =>
      key.expiresAt !== null && key.expiresAt.getTime() - now < EXPIRY_WARNING_DAYS * DAY,
  );

  return (
    <section aria-labelledby="api-keys-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="api-keys-heading" className="text-sm font-semibold text-ink">
            API keys
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-ink-muted">
            A key acts for the person who created it, so everything it does is attributable in the
            audit log. Give each integration its own — one shared key is one revocation that breaks
            four systems.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus aria-hidden />
          New key
        </Button>
      </div>

      {expiringSoon.length > 0 ? (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-caution-border bg-caution-soft px-4 py-3 text-sm text-caution">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {expiringSoon.length} key{expiringSoon.length === 1 ? '' : 's'} expire
            {expiringSoon.length === 1 ? 's' : ''} within {EXPIRY_WARNING_DAYS} days. Create the
            replacement, move the integration over, then revoke the old one — in that order.
          </span>
        </p>
      ) : null}

      {keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys yet"
          description="A key lets a PLM system, a retailer feed or your own scripts read and write passports without a browser. Scopes are fixed when the key is created, and the secret is shown exactly once."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus aria-hidden />
              Create the first key
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink-subtle">
                <Th>Name</Th>
                <Th>Key</Th>
                <Th>Scopes</Th>
                <Th>Last used</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...keys]
                .sort((a, b) => keyRank(a, now) - keyRank(b, now))
                .map((key) => (
                  <KeyRow key={key.id} apiKey={key} now={now} />
                ))}
            </tbody>
          </table>
        </div>
      )}

      <RevealDialog
        secret={state.key ?? null}
        name={state.keyName ?? 'New key'}
        origin={origin}
        dismissed={dismissed}
        onDismiss={() => setDismissed(true)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form action={action}>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>
                Scopes are fixed when the key is created. To change them, create a new key and
                revoke this one.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              {state.error ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {state.error}
                </p>
              ) : null}

              <Field
                label="Name"
                htmlFor="key-name"
                hint="What will use this key — “Centric PLM sync”, “Zalando feed”."
                required
              >
                <Input id="key-name" name="name" required maxLength={255} autoFocus />
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">Scopes</legend>
                {API_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2.5 transition-colors duration-[140ms] hover:bg-surface-sunken/60"
                  >
                    <input
                      type="checkbox"
                      name="scopes"
                      value={scope}
                      defaultChecked={scope === 'passports:read'}
                      className="mt-0.5 size-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-ink">{SCOPE_LABELS[scope]}</span>
                        {scope === 'passports:publish' ? (
                          <Badge tone="caution">
                            <ShieldAlert aria-hidden />
                            Reaches the public
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mono block text-2xs text-ink-subtle">{scope}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {SCOPE_DESCRIPTIONS[scope]}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <Field
                label="Expires"
                htmlFor="key-expiry"
                hint="A key that never expires is a key nobody ever rotates."
              >
                <NativeSelect id="key-expiry" name="expiresInDays" defaultValue="365">
                  <option value="90">In 90 days</option>
                  <option value="365">In a year</option>
                  <option value="730">In two years</option>
                  <option value="never">Never</option>
                </NativeSelect>
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Create key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * The show-once moment.
 *
 * Escape does nothing, clicking away does nothing, and there is no close
 * button. The only way past is to tick a box that says the key has been saved,
 * because that is the one interaction a person cannot perform by accident while
 * reaching for something else.
 */
function RevealDialog({
  secret,
  name,
  origin,
  dismissed,
  onDismiss,
}: {
  secret: string | null;
  name: string;
  origin: string;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (secret) setSaved(false);
  }, [secret]);

  const open = Boolean(secret) && !dismissed;

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        className="max-w-xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <p className="eyebrow text-caution">Shown once — it cannot be shown again</p>
          <DialogTitle>“{name}” is ready</DialogTitle>
          <DialogDescription>
            Polytrail stores a hash of this key, not the key. Nobody here can recover it, read it
            back to you over support, or print it in a log. If it is lost, the only remedy is to
            revoke this key and create another.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <div>
            <p className="eyebrow mb-1.5">Your key</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="mono min-w-0 flex-1 overflow-x-auto rounded-md border border-caution-border bg-caution-soft px-3 py-2.5 text-xs text-ink select-all">
                {secret}
              </code>
              <CopyButton value={secret ?? ''} label="Copy key" />
            </div>
          </div>

          <div>
            <p className="eyebrow mb-1.5">Try it now, while you have it</p>
            <pre className="mono overflow-x-auto rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-2xs leading-relaxed text-ink-muted">
              {`curl ${origin}/api/v1/passports \\
  -H "Authorization: Bearer ${secret ?? ''}"`}
            </pre>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-3 transition-colors duration-[140ms] hover:bg-surface-sunken/60">
            <Checkbox
              checked={saved}
              onCheckedChange={(checked) => setSaved(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-ink">
              I have saved this key somewhere safe. I understand it will not be shown again.
            </span>
          </label>
        </DialogBody>

        <DialogFooter>
          <Button type="button" disabled={!saved} onClick={onDismiss}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyRow({ apiKey, now }: { apiKey: ApiKeySummary; now: number }) {
  const [state, action, pending] = useActionState(revokeApiKeyAction, {});
  const expired = apiKey.expiresAt !== null && apiKey.expiresAt.getTime() <= now;
  const revoked = apiKey.revokedAt !== null;
  const daysLeft =
    apiKey.expiresAt === null ? null : Math.ceil((apiKey.expiresAt.getTime() - now) / DAY);
  const soon = !revoked && !expired && daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS;

  return (
    <tr className="transition-colors duration-[140ms] hover:bg-surface-sunken/60">
      <td className="py-3 pr-4 pl-4">
        <span className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 h-7 w-0.5 shrink-0 rounded-full',
              revoked || expired ? 'bg-line-strong' : soon ? 'bg-caution' : 'bg-positive',
            )}
          />
          <span className="min-w-0">
            <span
              className={cn(
                'block font-medium',
                revoked || expired ? 'text-ink-muted line-through' : 'text-ink',
              )}
            >
              {apiKey.name}
            </span>
            <span className="block text-2xs text-ink-subtle">
              Created {formatDate(apiKey.createdAt)}
            </span>
          </span>
        </span>
      </td>
      <td className="mono px-4 py-3 text-xs text-ink-muted whitespace-nowrap">{apiKey.prefix}…</td>
      <td className="px-4 py-3">
        <span className="flex flex-wrap gap-1">
          {apiKey.scopes.map((scope) => (
            <Badge key={scope} tone={scope === 'passports:publish' ? 'caution' : 'outline'}>
              {scope}
            </Badge>
          ))}
        </span>
      </td>
      <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap text-ink-muted">
        {apiKey.lastUsedAt ? (
          formatDate(apiKey.lastUsedAt)
        ) : (
          <span className="text-ink-subtle">Never used</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap">
        {apiKey.expiresAt === null ? (
          <span className="text-ink-subtle">Never</span>
        ) : expired ? (
          <span className="text-ink-muted">{formatDate(apiKey.expiresAt)}</span>
        ) : (
          <span className={soon ? 'font-medium text-caution' : 'text-ink-muted'}>
            in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {revoked ? (
          <Badge tone="neutral">Revoked</Badge>
        ) : expired ? (
          <Badge tone="neutral">Expired</Badge>
        ) : (
          <Badge tone="positive">
            <Check aria-hidden />
            Active
          </Badge>
        )}
        {state.error ? (
          <span className="mt-1 block text-2xs text-critical">{state.error}</span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right">
        {revoked ? (
          <span className="text-xs text-ink-subtle whitespace-nowrap">
            {formatDate(apiKey.revokedAt!)}
          </span>
        ) : (
          <form action={action} className="inline">
            <input type="hidden" name="keyId" value={apiKey.id} />
            <Button type="submit" variant="ghost" size="xs" loading={pending}>
              Revoke
            </Button>
          </form>
        )}
      </td>
    </tr>
  );
}

/** Live keys first, then those expiring soonest, then the retired ones. */
function keyRank(key: ApiKeySummary, now: number): number {
  if (key.revokedAt !== null) return 3;
  if (key.expiresAt !== null && key.expiresAt.getTime() <= now) return 2;
  if (key.expiresAt !== null && key.expiresAt.getTime() - now < EXPIRY_WARNING_DAYS * DAY) return 0;
  return 1;
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access is denied in some embedded browsers. The value is
          // on screen and selectable, so there is nothing to recover from.
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap ${className ?? ''}`}
      {...props}
    />
  );
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
