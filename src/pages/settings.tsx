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
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { useTheme } from "@/providers/theme-provider";

type GatewayConnection = {
  hasToken: boolean;
  status: string;
  url: string;
};

type GatewayConfigResponse = {
  config: unknown;
  connection: GatewayConnection;
};

type GatewayCron = {
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

type SettingsState = {
  config: unknown;
  connection: GatewayConnection | null;
  connectionError: string | null;
  crons: GatewayCron[];
  cronsError: string | null;
  isLoading: boolean;
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

const SettingsPage = () => {
  const { theme, toggleTheme } = useTheme();
  const [state, setState] = React.useState<SettingsState>({
    config: null,
    connection: null,
    connectionError: null,
    crons: [],
    cronsError: null,
    isLoading: true,
  });

  React.useEffect(() => {
    let isCurrent = true;

    async function loadSettings() {
      setState((currentState) => ({
        ...currentState,
        connectionError: null,
        cronsError: null,
        isLoading: true,
      }));

      const [configResult, cronsResult] = await Promise.allSettled([
        apiGet<GatewayConfigResponse>("/api/gateway/config"),
        apiGet<GatewayCronsResponse>("/api/gateway/crons"),
      ]);

      if (!isCurrent) {
        return;
      }

      setState({
        config:
          configResult.status === "fulfilled" ? (configResult.value?.config ?? null) : null,
        connection:
          configResult.status === "fulfilled"
            ? (configResult.value?.connection ?? null)
            : null,
        connectionError:
          configResult.status === "rejected" ? getErrorMessage(configResult.reason) : null,
        crons: cronsResult.status === "fulfilled" ? (cronsResult.value?.crons ?? []) : [],
        cronsError:
          cronsResult.status === "rejected" ? getErrorMessage(cronsResult.reason) : null,
        isLoading: false,
      });
    }

    void loadSettings();

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <>
      <PageHeader>
        <PageHeaderRow>
          <PageHeaderTitle>Settings</PageHeaderTitle>
          <PageHeaderActions>
            <Button variant="outline" size="sm" onClick={toggleTheme}>
              Use {theme === "dark" ? "light" : "dark"} theme
            </Button>
            <ChatPanelToggle />
          </PageHeaderActions>
        </PageHeaderRow>
      </PageHeader>

      <div className="space-y-6">
        <p className="text-muted-foreground text-sm">
          Gateway connection details, scheduled jobs, and client theme controls.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Gateway connection</CardTitle>
            <CardDescription>
              Mission Control server connectivity to the OpenClaw gateway.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {state.isLoading && !state.connection && !state.connectionError ? (
              <p className="text-muted-foreground text-sm">
                Loading gateway config...
              </p>
            ) : state.connectionError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.connectionError}
              </p>
            ) : state.connection ? (
              <>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{state.connection.status}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Gateway URL</dt>
                    <dd className="break-all">{state.connection.url}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Authentication</dt>
                    <dd>{state.connection.hasToken ? "Bearer token configured" : "No token configured"}</dd>
                  </div>
                </dl>

                <div className="space-y-2">
                  <h2 className="text-sm font-medium">Gateway config</h2>
                  <pre className="overflow-x-auto rounded-lg border bg-slate-50 p-4 text-xs dark:bg-slate-900">
                    {JSON.stringify(state.config, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No gateway config returned.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cron jobs</CardTitle>
            <CardDescription>
              Scheduled gateway jobs returned by <code>/api/gateway/crons</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.isLoading && state.crons.length === 0 && !state.cronsError ? (
              <p className="text-muted-foreground text-sm">Loading cron jobs...</p>
            ) : state.cronsError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.cronsError}
              </p>
            ) : state.crons.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No cron jobs configured.
              </p>
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
                    {state.crons.map((cron) => (
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

export default SettingsPage;
