import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { canConfigureConnectors } from '@/lib/import/access';
import { CONNECTOR_KIND_INFO } from '@/lib/connectors/kinds';
import { getConnector, toSummary } from '@/lib/connectors/store';
import type { RestSettings } from '@/lib/connectors/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { updateConnectorAction } from '../actions';
import { ConnectorForm } from '../connector-form';
import { TestPanel } from './test-panel';

export default async function ConnectorPage({
  params,
}: {
  params: Promise<{ connectorId: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!canConfigureConnectors(session)) redirect('/console');

  const { connectorId } = await params;
  const record = await getConnector(session.tenantId, connectorId);
  if (!record) notFound();

  // Everything the page renders comes from the summary, which has no
  // credential on it. The full record is read only so the server can tell the
  // form whether one exists.
  const connector = toSummary(record);
  const info = CONNECTOR_KIND_INFO[connector.kind];

  return (
    <>
      <PageHeader
        title={connector.name}
        description={`${info.label} · ${connector.hasSecret ? 'a credential is stored, encrypted' : 'no credential stored'} · added ${new Date(connector.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <>
            {connector.lastTestedAt === null ? (
              <Badge tone="caution">Never tested</Badge>
            ) : connector.lastTestOk ? (
              <Badge tone="positive">Last test worked</Badge>
            ) : (
              <Badge tone="critical">Last test failed</Badge>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href="/console/connectors">
                <ArrowLeft aria-hidden />
                All connectors
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <TestPanel
          connectorId={connector.id}
          implemented={info.implemented}
          notImplementedReason={info.status}
        />

        <ConnectorForm
          action={updateConnectorAction}
          mode="edit"
          connectorId={connector.id}
          initialKind={connector.kind}
          initialName={connector.name}
          initialSettings={connector.settings as Partial<RestSettings>}
          hasSecret={connector.hasSecret}
          submitLabel="Save changes"
        />
      </div>
    </>
  );
}
