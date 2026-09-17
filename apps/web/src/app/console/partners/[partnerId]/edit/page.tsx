import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { updatePartner } from '@/lib/partners/actions';
import { getPartner } from '@/lib/partners/queries';
import type { PartnerRole, SupplyTier } from '@/lib/partners/vocab';
import { PageHeader } from '@/components/ui/page-header';
import { PartnerForm } from '../../partner-form';

export const metadata = { title: 'Edit supplier' };

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { partnerId } = await params;
  const partner = await getPartner(session.tenantId, partnerId);
  if (!partner) notFound();

  return (
    <>
      <PageHeader title={`Edit ${partner.name}`} />
      <div className="px-8 py-8">
        <PartnerForm
          action={updatePartner.bind(null, partnerId)}
          submitLabel="Save changes"
          cancelHref={`/console/partners/${partnerId}`}
          values={{
            name: partner.name,
            legalName: partner.legalName,
            tier: partner.tier as SupplyTier,
            roles: partner.roles as PartnerRole[],
            country: partner.country,
            line1: partner.address?.line1 ?? null,
            line2: partner.address?.line2 ?? null,
            city: partner.address?.city ?? null,
            region: partner.address?.region ?? null,
            postalCode: partner.address?.postalCode ?? null,
            latitude: partner.latitude,
            longitude: partner.longitude,
            gln: partner.gln,
            osId: partner.osId,
            lei: partner.lei,
            did: partner.did,
            contactName: partner.contactName,
            contactEmail: partner.contactEmail,
            workerCount: partner.workerCount,
            capabilities: partner.capabilities,
            notes: partner.notes,
          }}
        />
      </div>
    </>
  );
}
