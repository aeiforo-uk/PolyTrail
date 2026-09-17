import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { createPartner } from '@/lib/partners/actions';
import { PageHeader } from '@/components/ui/page-header';
import { PartnerForm } from '../partner-form';

export const metadata = { title: 'Add supplier' };

export default async function NewPartnerPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  return (
    <>
      <PageHeader
        title="Add a supplier"
        description="One row per facility, not per company. Two mills owned by the same group can have very different audit records."
      />
      <div className="px-8 py-8">
        <PartnerForm
          action={createPartner}
          submitLabel="Add supplier"
          cancelHref="/console/partners"
        />
      </div>
    </>
  );
}
