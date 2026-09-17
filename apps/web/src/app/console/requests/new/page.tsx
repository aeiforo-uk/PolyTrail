import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Factory } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { createRequest } from '@/lib/data-requests/actions';
import { fieldSections, suggestedSectionsFor } from '@/lib/data-requests/fields';
import { listPassportOptions } from '@/lib/data-requests/queries';
import { listPartnerOptions } from '@/lib/partners/queries';
import { getWorkspace } from '../../queries';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { RequestComposer } from './request-composer';

export const metadata = { title: 'New data request' };

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const [partners, passports, workspace, params] = await Promise.all([
    listPartnerOptions(session.tenantId),
    listPassportOptions(session.tenantId),
    getWorkspace(session.tenantId),
    searchParams,
  ]);

  if (partners.length === 0) {
    return (
      <>
        <PageHeader title="New data request" />
        <div className="px-8 py-8">
          <EmptyState
            icon={Factory}
            title="Add a supplier first"
            description="A data request goes to one facility. Add the mill, factory or farm you want to ask, then come back."
            action={
              <Button asChild size="sm">
                <Link href="/console/partners/new">Add a supplier</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New data request"
        description="Ask one facility for the fields you cannot fill in yourself. They answer through a link — no account, no software."
      />
      <div className="px-8 py-8">
        <RequestComposer
          action={createRequest}
          brandName={workspace?.legalName ?? 'Your brand'}
          initialPartnerId={params.partnerId}
          partners={partners.map((partner) => ({
            id: partner.id,
            name: partner.name,
            tier: partner.tier,
            contactName: partner.contactName,
            contactEmail: partner.contactEmail,
            suggestedSections: [...suggestedSectionsFor(partner.tier)],
          }))}
          passports={passports.map((passport) => ({
            id: passport.id,
            dppId: passport.dppId,
            name: passport.name ?? 'Untitled product',
          }))}
          sections={fieldSections()}
        />
      </div>
    </>
  );
}
