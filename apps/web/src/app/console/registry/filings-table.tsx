'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarClock,
  Check,
  CircleSlash,
  Clock,
  RefreshCw,
  Send,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDppId } from '@/lib/passport/identifier';
import type { FilingRow } from '@/lib/registry/queries';
import {
  checkStatusAction,
  submitFilingAction,
  withdrawFilingAction,
  type FilingState,
} from './actions';

/**
 * Filing status, one row per passport.
 *
 * The column that matters most is the one nobody else has: when the proof of
 * registration expires. A registration is good for ninety days, after which the
 * brand is unregistered and will not be told — so the expiry is shown as a date
 * *and* as a countdown, and it starts shouting a fortnight out.
 */
export function FilingsTable({ rows, canFile }: { rows: FilingRow[]; canFile: boolean }) {
  const [state, submit, submitting] = useActionState<FilingState, FormData>(submitFilingAction, {});
  const [statusState, check, checking] = useActionState<FilingState, FormData>(
    checkStatusAction,
    {},
  );
  const [withdrawing, setWithdrawing] = useState<FilingRow | null>(null);

  const notice = state.error ?? statusState.error ?? state.message ?? statusState.message;
  const isError = Boolean(state.error ?? statusState.error);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Upload}
        title="No published passports yet"
        description="The Registry stores the address of a passport a reader can open, so a passport has to be published before it can be filed."
        action={
          <Button asChild size="sm" variant="secondary">
            <Link href="/console/passports">Go to passports</Link>
          </Button>
        }
      />
    );
  }

  return (
    <section aria-labelledby="filings-heading">
      <h2 id="filings-heading" className="sr-only">
        Filing status
      </h2>

      {notice ? (
        <p
          role="status"
          className={
            isError
              ? 'mb-3 flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical'
              : 'mb-3 flex items-start gap-2 rounded-md border border-positive-border bg-positive-soft px-3 py-2.5 text-sm text-positive'
          }
        >
          {isError ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {notice}
        </p>
      ) : null}

      <Table>
        <THead>
            <TR>
              <TH>Passport</TH>
              <TH>Filing</TH>
              <TH>Proof expires</TH>
              <TH>Readiness</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.dppId}>
                <TD>
                  <Link
                    href={`/console/registry/${row.dppId}`}
                    className="font-medium text-ink hover:text-accent hover:underline"
                  >
                    {row.productName}
                  </Link>
                  <p className="mono mt-0.5 text-2xs text-ink-subtle">
                    {formatDppId(row.dppId)} · v{row.version} · {row.scope}
                  </p>
                </TD>

                <TD>
                  <FilingCell row={row} />
                </TD>

                <TD>
                  <ExpiryCell row={row} />
                </TD>

                <TD>
                  {row.readyToFile ? (
                    <Badge tone="positive">
                      <Check aria-hidden />
                      Ready
                    </Badge>
                  ) : (
                    <Badge tone="caution" title={row.firstIssue ?? undefined}>
                      <ShieldAlert aria-hidden />
                      {row.blockingIssues} to fix
                    </Badge>
                  )}
                </TD>

                <TD className="text-right">
                  {canFile ? (
                    <div className="flex justify-end gap-1.5">
                      <form action={submit}>
                        <input type="hidden" name="dppId" value={row.dppId} />
                        <Button
                          type="submit"
                          size="xs"
                          variant={row.registryId ? 'secondary' : 'primary'}
                          loading={submitting}
                          disabled={!row.readyToFile}
                          title={
                            row.readyToFile
                              ? undefined
                              : (row.firstIssue ?? 'This record is not complete enough to file.')
                          }
                        >
                          <Send aria-hidden />
                          {row.registryId ? 'Re-file' : 'File'}
                        </Button>
                      </form>

                      {row.registryId ? (
                        <>
                          <form action={check}>
                            <input type="hidden" name="dppId" value={row.dppId} />
                            <Button type="submit" size="xs" variant="ghost" loading={checking}>
                              <RefreshCw aria-hidden />
                              Status
                            </Button>
                          </form>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setWithdrawing(row)}
                          >
                            <CircleSlash aria-hidden />
                            Withdraw
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-2xs text-ink-subtle">View only</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
      </Table>

      <WithdrawDialog row={withdrawing} onClose={() => setWithdrawing(null)} />
    </section>
  );
}

function FilingCell({ row }: { row: FilingRow }) {
  if (!row.registryId) {
    return <span className="text-sm text-ink-subtle">Not filed</span>;
  }
  return (
    <div>
      <p className="mono text-2xs text-ink">{row.registryId}</p>
      {row.staleFiling ? (
        <span className="mt-1 inline-flex items-center gap-1 text-2xs text-caution">
          <AlertCircle className="size-3" aria-hidden />
          Changed since filing
        </span>
      ) : null}
    </div>
  );
}

function ExpiryCell({ row }: { row: FilingRow }) {
  if (!row.proofExpiresAt) return <span className="text-sm text-ink-subtle">—</span>;

  const days = Math.floor((new Date(row.proofExpiresAt).getTime() - Date.now()) / 86_400_000);
  const date = new Date(row.proofExpiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (row.proofHealth === 'expired') {
    return (
      <Badge tone="critical" title={`Expired on ${date}`}>
        <AlertCircle aria-hidden />
        Expired {date}
      </Badge>
    );
  }
  if (row.proofHealth === 'expiring') {
    return (
      <Badge tone="caution" title={`Expires on ${date}`}>
        <CalendarClock aria-hidden />
        {days} day{days === 1 ? '' : 's'} left
      </Badge>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-ink-muted">
      <Clock className="size-3.5 text-ink-subtle" aria-hidden />
      {date}
    </span>
  );
}

function WithdrawDialog({ row, onClose }: { row: FilingRow | null; onClose: () => void }) {
  const [state, action, pending] = useActionState<FilingState, FormData>(
    withdrawFilingAction,
    {},
  );

  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form action={action}>
          <input type="hidden" name="dppId" value={row?.dppId ?? ''} />
          <DialogHeader>
            <DialogTitle>Withdraw this registration</DialogTitle>
            <DialogDescription>
              The passport itself stays published. Only the Registry entry is withdrawn, and the
              audit log keeps its identifier — a withdrawn registration still happened.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            {state.error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {state.error}
                  {state.stepUpRequired ? (
                    <>
                      {' '}
                      <Link href="/console/security" className="underline">
                        Confirm your code in Security
                      </Link>
                      , then come back.
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}

            <Field
              label="Reason"
              htmlFor="withdraw-reason"
              hint="Recorded in the audit chain and sent to the Registry."
              required
            >
              <Textarea
                id="withdraw-reason"
                name="reason"
                rows={3}
                required
                placeholder="The product was discontinued before it reached the market."
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={pending}>
              Withdraw
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
