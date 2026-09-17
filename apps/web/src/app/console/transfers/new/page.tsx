import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { listOwnedPassports } from '@/lib/transfers/queries';
import { TRANSFERABLE_PASSPORT_STATUSES, canTransfer } from '@/lib/transfers/state';
import { formatDppId, normalizeDppId } from '@/lib/passport/identifier';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { InitiateForm } from './initiate-form';

export const metadata = { title: 'Transfer a passport' };

/**
 * Starting a transfer.
 *
 * The item list is filtered to what this workspace actually owns and could
 * legally hand over, so the reasons a transfer would be refused are visible
 * before anything is typed rather than after the form is submitted.
 */
export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ dppId?: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const allowed = canTransfer(
    { status: 'published', tenantId: session.tenantId, ownerTenantId: session.tenantId },
    session,
  );

  const owned = await listOwnedPassports(session.tenantId);
  const options = owned
    .filter((item) => TRANSFERABLE_PASSPORT_STATUSES.includes(item.status))
    .map((item) => ({
      dppId: item.dppId,
      label: item.productName ?? 'Untitled item',
      display: formatDppId(item.dppId),
      status: item.status,
      transferInFlight: item.transferInFlight,
    }));

  const params = await searchParams;
  const preselected = params.dppId ? normalizeDppId(params.dppId) : null;

  return (
    <>
      <PageHeader
        title="Transfer a passport"
        description="Hand an item — and its record — to whoever holds it next."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/console/transfers">
              <ArrowLeft aria-hidden />
              All transfers
            </Link>
          </Button>
        }
      />

      <div className="max-w-2xl px-8 py-8">
        {!allowed.ok ? (
          <EmptyState title="You cannot transfer passports" description={allowed.reason} />
        ) : options.length === 0 ? (
          <EmptyState
            title="Nothing here can be transferred yet"
            description="Only published passports can change hands — a draft has never been in anyone’s hands, so there is nothing to hand over."
            action={
              <Button asChild size="sm" variant="secondary">
                <Link href="/console/passports">Go to passports</Link>
              </Button>
            }
          />
        ) : (
          <InitiateForm options={options} preselected={preselected} />
        )}
      </div>
    </>
  );
}
