import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { canConfigureConnectors } from '@/lib/import/access';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { createConnectorAction } from '../actions';
import { ConnectorForm } from '../connector-form';

export const metadata = { title: 'Add a connector' };

export default async function NewConnectorPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!canConfigureConnectors(session)) redirect('/console');

  return (
    <>
      <PageHeader
        title="Add a connector"
        description="Point it at an endpoint that returns a JSON list of products. Nothing is fetched until you ask for it, and nothing is written to a passport until you have mapped the fields and reviewed what the import would do."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/console/connectors">
              <ArrowLeft aria-hidden />
              All connectors
            </Link>
          </Button>
        }
      />
      <div className="px-8 py-8">
        <ConnectorForm action={createConnectorAction} mode="create" submitLabel="Add connector" />
      </div>
    </>
  );
}
