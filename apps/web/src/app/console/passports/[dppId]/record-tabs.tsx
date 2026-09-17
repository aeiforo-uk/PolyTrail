'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * The four ways of reading one passport.
 *
 * Each panel is rendered on the server and handed in as a node, so this file
 * holds the tab state and nothing else — the disclosure table, the version
 * timeline and the audit trail never cross the client boundary just to be
 * switched between.
 */
export function RecordTabs({
  overview,
  disclosure,
  versions,
  activity,
  versionCount,
  activityCount,
}: {
  overview: React.ReactNode;
  disclosure: React.ReactNode;
  versions: React.ReactNode;
  activity: React.ReactNode;
  versionCount: number;
  activityCount: number;
}) {
  return (
    <Tabs defaultValue="overview">
      <div className="border-b border-line px-8">
        <TabsList className="border-b-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="disclosure">Disclosure</TabsTrigger>
          <TabsTrigger value="versions">
            Versions
            <Count value={versionCount} />
          </TabsTrigger>
          <TabsTrigger value="activity">
            Activity
            <Count value={activityCount} />
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="px-8 py-8">
        <TabsContent value="overview">{overview}</TabsContent>
        <TabsContent value="disclosure">{disclosure}</TabsContent>
        <TabsContent value="versions">{versions}</TabsContent>
        <TabsContent value="activity">{activity}</TabsContent>
      </div>
    </Tabs>
  );
}

function Count({ value }: { value: number }) {
  if (value === 0) return null;
  return <span className="ml-1.5 text-2xs text-ink-subtle tabular-nums">{value}</span>;
}
