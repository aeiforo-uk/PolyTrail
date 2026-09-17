'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  PauseCircle,
  Plus,
  Radio,
  TriangleAlert,
  XCircle,
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
import { Input, Textarea } from '@/components/ui/input';
import { Legend, StackedBar } from '@/components/viz/bar-chart';
import { Meter } from '@/components/viz/meter';
import { STATUS } from '@/components/viz/tokens';
import { EVENT_DESCRIPTIONS, WEBHOOK_EVENTS } from '@/lib/webhooks/events';
import { DEFAULT_TOLERANCE_SECONDS, SIGNATURE_HEADER } from '@/lib/webhooks/constants';
import type { DeliveryLogRow, WebhookEndpointSummary } from '@/lib/webhooks/service';
import { cn } from '@/lib/utils';
import {
  createWebhookAction,
  deleteWebhookAction,
  testWebhookAction,
  toggleWebhookAction,
  type ActionState,
} from './actions';
import { CopyButton } from './api-keys-panel';

/** The verification recipe, as code somebody can paste. */
const VERIFY_SNIPPET = `import { createHmac, timingSafeEqual } from 'node:crypto';

// ${SIGNATURE_HEADER}: t=1750000000,v1=9f86d081884c7d65…
export function verify(rawBody, header, secret) {
  const parts = new Map(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );

  const t = parts.get('t');
  const v1 = parts.get('v1');
  if (!t || !v1) return false;

  // A valid signature on a replayed body is still a replay. The timestamp is
  // inside the MAC, so it cannot be edited without breaking the signature.
  if (Math.abs(Date.now() / 1000 - Number(t)) > ${DEFAULT_TOLERANCE_SECONDS}) return false;

  const expected = createHmac('sha256', secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}`;

export function WebhooksPanel({
  endpoints,
  deliveries,
}: {
  endpoints: WebhookEndpointSummary[];
  deliveries: DeliveryLogRow[];
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [state, action, pending] = useActionState<
    ActionState & { secret?: string; url?: string },
    FormData
  >(createWebhookAction, {});

  useEffect(() => {
    if (state.secret) {
      setOpen(false);
      setDismissed(false);
    }
  }, [state.secret]);

  const byEndpoint = useMemo(() => {
    const map = new Map<string, DeliveryLogRow[]>();
    for (const delivery of deliveries) {
      const list = map.get(delivery.endpointId);
      if (list) list.push(delivery);
      else map.set(delivery.endpointId, [delivery]);
    }
    return map;
  }, [deliveries]);

  // Worst first: paused outranks failing, failing outranks healthy.
  const ranked = [...endpoints].sort((a, b) => endpointRank(a) - endpointRank(b));
  const struggling = endpoints.filter((e) => !e.active || e.consecutiveFailures > 0);

  return (
    <section aria-labelledby="webhooks-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="webhooks-heading" className="text-sm font-semibold text-ink">
            Webhooks
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-ink-muted">
            Deliveries are signed and timestamped, retried with backoff for about eight hours, and
            paused automatically after sustained failure. At-least-once is the only honest guarantee
            over HTTP, so every body carries a stable id you can deduplicate on.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus aria-hidden />
          Add endpoint
        </Button>
      </div>

      {struggling.length > 0 ? (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">
              {struggling.length} endpoint{struggling.length === 1 ? '' : 's'} not receiving
              reliably.
            </strong>{' '}
            Anything published while an endpoint is paused is not queued for it — resume it and the
            next event is delivered, not the backlog.
          </span>
        </p>
      ) : null}

      {endpoints.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No endpoints yet"
          description="Point one at your own service to be told the moment a passport is published, updated or recalled — rather than polling for it. A recall in particular is something a retailer's system needs to hear about within minutes, not on the next nightly sync."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus aria-hidden />
              Add the first endpoint
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {ranked.map((endpoint) => (
            <EndpointRow
              key={endpoint.id}
              endpoint={endpoint}
              deliveries={byEndpoint.get(endpoint.id) ?? []}
            />
          ))}
        </ul>
      )}

      <DeliveryLog deliveries={deliveries} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-lg border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold text-ink">Verifying a delivery</h3>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            Read the raw body as a string — do not parse and re-serialise it first, because JSON
            round-tripping reorders keys and the signature will fail. Then check the header against
            your endpoint&rsquo;s secret.
          </p>
          <div className="mt-3 flex items-center justify-end">
            <CopyButton value={VERIFY_SNIPPET} label="Copy the snippet" />
          </div>
          <pre className="mono mt-2 max-h-96 overflow-auto rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-2xs leading-relaxed text-ink">
            {VERIFY_SNIPPET}
          </pre>
        </section>

        <section className="min-w-0 rounded-lg border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold text-ink">Headers on every delivery</h3>
          <dl className="mt-3 flex flex-col gap-px overflow-hidden rounded-md bg-line">
            {[
              {
                name: SIGNATURE_HEADER,
                value: 't=1750000000,v1=9f86d081884c7d65…',
                note: `HMAC-SHA256 over "\${t}.\${rawBody}". Reject anything more than ${DEFAULT_TOLERANCE_SECONDS} seconds from your clock.`,
              },
              {
                name: 'Polytrail-Event',
                value: 'passport.published',
                note: 'The event type, so you can route before parsing the body.',
              },
              {
                name: 'Polytrail-Delivery',
                value: '01H…',
                note: 'Stable across retries of the same event. Deduplicate on it.',
              },
            ].map((header) => (
              <div key={header.name} className="bg-surface px-3 py-2.5">
                <dt className="mono text-2xs font-medium text-ink">{header.name}</dt>
                <dd className="mono mt-0.5 truncate text-2xs text-accent">{header.value}</dd>
                <dd className="mt-1 text-2xs leading-relaxed text-ink-subtle">{header.note}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <RevealSecretDialog
        secret={state.secret ?? null}
        url={state.url ?? ''}
        dismissed={dismissed}
        onDismiss={() => setDismissed(true)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form action={action}>
            <DialogHeader>
              <DialogTitle>Add a webhook endpoint</DialogTitle>
              <DialogDescription>
                The signing secret is shown once. Use it to verify the{' '}
                <code className="mono text-xs">{SIGNATURE_HEADER}</code> header on every delivery.
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
                label="URL"
                htmlFor="endpoint-url"
                hint="Must be HTTPS. It should answer 2xx within a few seconds and do its real work afterwards."
                required
              >
                <Input
                  id="endpoint-url"
                  name="url"
                  type="url"
                  required
                  autoFocus
                  className="mono"
                  placeholder="https://example.com/hooks/polytrail"
                />
              </Field>

              <Field label="Description" htmlFor="endpoint-description">
                <Textarea
                  id="endpoint-description"
                  name="description"
                  maxLength={255}
                  placeholder="Which system this is, and who owns it."
                />
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">Events</legend>
                {WEBHOOK_EVENTS.map((event) => (
                  <label
                    key={event}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2.5 transition-colors duration-[140ms] hover:bg-surface-sunken/60"
                  >
                    <input
                      type="checkbox"
                      name="events"
                      value={event}
                      defaultChecked={
                        event === 'passport.published' || event === 'passport.recalled'
                      }
                      className="mt-0.5 size-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="mono block text-xs text-ink">{event}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {EVENT_DESCRIPTIONS[event]}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Add endpoint
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The same deliberate dismissal the API key gets, for the same reason. */
function RevealSecretDialog({
  secret,
  url,
  dismissed,
  onDismiss,
}: {
  secret: string | null;
  url: string;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (secret) setSaved(false);
  }, [secret]);

  return (
    <Dialog open={Boolean(secret) && !dismissed}>
      <DialogContent
        hideClose
        className="max-w-xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <p className="eyebrow text-caution">Shown once — it cannot be shown again</p>
          <DialogTitle>Signing secret</DialogTitle>
          <DialogDescription>
            For <span className="mono text-xs">{url}</span>. Every delivery to this endpoint is
            signed with it. Without it you cannot tell a real delivery from anyone who has guessed
            your URL.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="mono min-w-0 flex-1 overflow-x-auto rounded-md border border-caution-border bg-caution-soft px-3 py-2.5 text-xs text-ink select-all">
              {secret}
            </code>
            <CopyButton value={secret ?? ''} label="Copy secret" />
          </div>

          <p className="text-sm text-ink-muted">
            Put it in your own secret store, not in the repository. The verification snippet is on
            the page behind this dialog.
          </p>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-3 transition-colors duration-[140ms] hover:bg-surface-sunken/60">
            <Checkbox
              checked={saved}
              onCheckedChange={(checked) => setSaved(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-ink">
              I have saved this secret somewhere safe. I understand it will not be shown again.
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

function EndpointRow({
  endpoint,
  deliveries,
}: {
  endpoint: WebhookEndpointSummary;
  deliveries: DeliveryLogRow[];
}) {
  const [testState, testAction, testing] = useActionState(testWebhookAction, {});
  const [toggleState, toggleAction, toggling] = useActionState(toggleWebhookAction, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteWebhookAction, {});

  const notice =
    testState.error ??
    toggleState.error ??
    deleteState.error ??
    testState.message ??
    toggleState.message;
  const isError = Boolean(testState.error ?? toggleState.error ?? deleteState.error);

  const accepted = deliveries.filter((delivery) => delivery.deliveredAt !== null).length;
  const rate = deliveries.length === 0 ? null : Math.round((accepted / deliveries.length) * 100);
  // Oldest on the left, so the strip reads as time passing.
  const timeline = [...deliveries].reverse();

  const health: 'critical' | 'caution' | 'positive' = !endpoint.active
    ? 'critical'
    : endpoint.consecutiveFailures > 0
      ? 'caution'
      : 'positive';

  return (
    <li className="flex items-stretch gap-4 overflow-hidden rounded-lg border border-line bg-surface">
      <span
        aria-hidden
        className={cn(
          'w-0.5 shrink-0',
          health === 'critical'
            ? 'bg-critical'
            : health === 'caution'
              ? 'bg-caution'
              : 'bg-positive',
        )}
      />

      <div className="min-w-0 flex-1 py-4 pr-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mono truncate text-sm text-ink">{endpoint.url}</p>
            {endpoint.description ? (
              <p className="mt-0.5 text-sm text-ink-muted">{endpoint.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1">
              {endpoint.events.map((event) => (
                <Badge key={event} tone="outline">
                  {event}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!endpoint.active ? (
              <Badge tone="critical">
                <PauseCircle aria-hidden />
                Paused after failing
              </Badge>
            ) : endpoint.consecutiveFailures > 0 ? (
              <Badge tone="caution">
                <TriangleAlert aria-hidden />
                {endpoint.consecutiveFailures} failed in a row
              </Badge>
            ) : (
              <Badge tone="positive">
                <CheckCircle2 aria-hidden />
                Receiving
              </Badge>
            )}

            <form action={testAction}>
              <input type="hidden" name="endpointId" value={endpoint.id} />
              <Button type="submit" variant="secondary" size="xs" loading={testing}>
                Send test
              </Button>
            </form>

            <form action={toggleAction}>
              <input type="hidden" name="endpointId" value={endpoint.id} />
              <input type="hidden" name="active" value={String(!endpoint.active)} />
              <Button type="submit" variant="ghost" size="xs" loading={toggling}>
                {endpoint.active ? 'Pause' : 'Resume'}
              </Button>
            </form>

            <form action={deleteAction}>
              <input type="hidden" name="endpointId" value={endpoint.id} />
              <Button type="submit" variant="ghost" size="xs" loading={deleting}>
                Delete
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-5 border-t border-line pt-3">
          <Meter
            value={rate ?? 0}
            size={40}
            thickness={4}
            tone={rate === null ? 'accent' : rate >= 95 ? 'positive' : rate >= 60 ? 'caution' : 'critical'}
            label={rate === null ? 'No attempts' : `${rate}% accepted`}
            sublabel={
              rate === null
                ? 'Send a test to prove it works'
                : `${accepted} of the last ${deliveries.length} attempts`
            }
          />

          <div className="min-w-48 flex-1">
            <p className="eyebrow mb-1.5">Recent deliveries</p>
            {timeline.length === 0 ? (
              <p className="text-2xs text-ink-subtle">
                Nothing delivered to this endpoint in the recent log.
              </p>
            ) : (
              <>
                <StackedBar
                  height={14}
                  ariaLabel={`${accepted} of ${timeline.length} recent deliveries accepted, oldest first`}
                  segments={timeline.map((delivery) => ({
                    key: delivery.id,
                    label: `${delivery.event} ${delivery.responseStatus ?? 'no response'}`,
                    value: 1,
                    colour: delivery.deliveredAt ? STATUS.good : STATUS.critical,
                  }))}
                />
                <p className="mt-1.5 flex justify-between text-2xs tabular-nums text-ink-subtle">
                  <span>{formatWhen(timeline[0]!.createdAt)}</span>
                  <span>{formatWhen(timeline[timeline.length - 1]!.createdAt)}</span>
                </p>
              </>
            )}
          </div>

          <p className="text-2xs text-ink-subtle">
            {endpoint.lastDeliveryAt
              ? `Last attempt ${endpoint.lastDeliveryAt.toLocaleString('en-GB')}`
              : 'No deliveries yet'}
          </p>
        </div>

        {notice ? (
          <p
            role="status"
            className={cn('mt-3 text-xs', isError ? 'text-critical' : 'text-positive')}
          >
            {notice}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function DeliveryLog({ deliveries }: { deliveries: DeliveryLogRow[] }) {
  if (deliveries.length === 0) return null;

  const accepted = deliveries.filter((delivery) => delivery.deliveredAt !== null).length;
  const refused = deliveries.length - accepted;
  const rate = Math.round((accepted / deliveries.length) * 100);
  const retries = deliveries.filter((delivery) => delivery.attempt > 1).length;

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Recent deliveries</h3>
          <p className="mt-0.5 text-sm text-ink-muted">
            The last {deliveries.length} attempts across every endpoint, newest first.{' '}
            {retries > 0
              ? `${retries} of them ${retries === 1 ? 'was a retry' : 'were retries'}.`
              : 'None of them were retries.'}
          </p>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'text-2xl font-semibold tracking-[-0.016em] tabular-nums',
              rate >= 95 ? 'text-positive' : rate >= 60 ? 'text-caution' : 'text-critical',
            )}
          >
            {rate}%
          </span>
          <span className="text-xs text-ink-subtle">accepted</span>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-line bg-surface p-5">
        <StackedBar
          ariaLabel={`${accepted} accepted, ${refused} refused`}
          segments={[
            { key: 'ok', label: 'Accepted', value: accepted, colour: STATUS.good },
            { key: 'failed', label: 'Refused or unreachable', value: refused, colour: STATUS.critical },
          ].filter((segment) => segment.value > 0)}
        />
        <Legend
          className="mt-3"
          items={[
            { key: 'ok', label: 'Accepted', value: String(accepted), colour: STATUS.good },
            {
              key: 'failed',
              label: 'Refused or unreachable',
              value: String(refused),
              colour: STATUS.critical,
            },
          ]}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-subtle">
              <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                When
              </th>
              <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                Event
              </th>
              <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                Endpoint
              </th>
              <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                Attempt
              </th>
              <th scope="col" className="px-4 py-2.5 text-xs font-medium whitespace-nowrap">
                Response
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {deliveries.map((delivery) => (
              <tr
                key={delivery.id}
                className="align-top transition-colors duration-[140ms] hover:bg-surface-sunken/60"
              >
                <td className="py-3 pr-4 pl-4">
                  <span className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 h-6 w-0.5 shrink-0 rounded-full',
                        delivery.deliveredAt ? 'bg-positive' : 'bg-critical',
                      )}
                    />
                    <span className="text-xs tabular-nums whitespace-nowrap text-ink-muted">
                      {delivery.createdAt.toLocaleString('en-GB')}
                    </span>
                  </span>
                </td>
                <td className="mono px-4 py-3 text-xs text-ink">{delivery.event}</td>
                <td className="mono max-w-[18rem] truncate px-4 py-3 text-xs text-ink-muted">
                  {delivery.endpointUrl}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums text-ink-muted">
                  {delivery.attempt}
                  {delivery.attempt > 1 ? (
                    <span className="ml-1 text-2xs text-caution">retry</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {delivery.deliveredAt ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-positive">
                      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                      {delivery.responseStatus} accepted
                    </span>
                  ) : (
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-critical">
                        <XCircle className="size-3.5 shrink-0" aria-hidden />
                        {delivery.responseStatus ?? 'No response'}
                      </span>
                      {delivery.error ? (
                        <span className="mono max-w-[24rem] truncate text-2xs text-ink-subtle">
                          {delivery.error}
                        </span>
                      ) : null}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function endpointRank(endpoint: WebhookEndpointSummary): number {
  if (!endpoint.active) return 0;
  if (endpoint.consecutiveFailures > 0) return 1;
  return 2;
}

function formatWhen(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
