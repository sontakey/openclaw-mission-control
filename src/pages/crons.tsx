import * as React from "react";

import { ChatPanelToggle } from "@/components/layout/chat-panel-toggle";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderRow,
  PageHeaderTitle,
} from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiGet } from "@/lib/api";

export type GatewayCron = {
  id: string;
  isActive: boolean | null;
  lastRunAt: number | null;
  name: string;
  nextRunAt: number | null;
  schedule: string;
};

type GatewayCronsResponse = {
  crons: GatewayCron[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatTimestamp(value: number | null) {
  if (value === null) {
    return "Not scheduled";
  }

  return new Date(value).toLocaleString();
}

function getCronStatusLabel(isActive: boolean | null) {
  if (isActive === true) {
    return "Enabled";
  }

  if (isActive === false) {
    return "Paused";
  }

  return "Unknown";
}

const CronsPage = () => {
  const [crons, setCrons] = React.useState<GatewayCron[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isCurrent = true;

    async function loadCrons() {
      setError(null);
      setIsLoading(true);

      try {
        const result = await apiGet<GatewayCronsResponse>("/api/gateway/crons");

        if (!isCurrent) {
          return;
        }

        setCrons(result?.crons ?? []);
      } catch (loadError) {
        if (!isCurrent) {
          return;
        }

        setCrons([]);
        setError(getErrorMessage(loadError));
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadCrons();

    return () => {
      isCurrent = false;
    };
  }, []);

  return <CronsPageContent crons={crons} error={error} isLoading={isLoading} />;
};

export const CronsPageContent = ({
  crons,
  error,
  isLoading,
}: {
  crons: GatewayCron[];
  error: string | null;
  isLoading: boolean;
}) => {
  return (
    <>
      <PageHeader>
        <PageHeaderRow>
          <PageHeaderTitle>Cron Jobs</PageHeaderTitle>
          <PageHeaderActions>
            <ChatPanelToggle />
          </PageHeaderActions>
        </PageHeaderRow>
      </PageHeader>

      <div className="space-y-6">
        <p className="text-muted-foreground text-sm">
          Scheduled gateway jobs returned by <code>/api/gateway/crons</code>.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Gateway cron jobs</CardTitle>
            <CardDescription>
              Monitor schedules, status, and the most recent execution times.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && crons.length === 0 && !error ? (
              <p className="text-muted-foreground text-sm">Loading cron jobs...</p>
            ) : error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : crons.length === 0 ? (
              <p className="text-muted-foreground text-sm">No cron jobs configured.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Name</th>
                      <th className="py-2 pr-4 font-medium">Schedule</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Next run</th>
                      <th className="py-2 font-medium">Last run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crons.map((cron) => (
                      <tr key={cron.id} className="border-b last:border-b-0">
                        <td className="py-3 pr-4">{cron.name}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{cron.schedule}</td>
                        <td className="py-3 pr-4">{getCronStatusLabel(cron.isActive)}</td>
                        <td className="py-3 pr-4">{formatTimestamp(cron.nextRunAt)}</td>
                        <td className="py-3">{formatTimestamp(cron.lastRunAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default CronsPage;
