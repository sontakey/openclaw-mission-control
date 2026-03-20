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

function getNestedValue(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function GatewayConfigSummary({ config }: { config: unknown }) {
  if (!config || typeof config !== "object") {
    return null;
  }

  const c = config as Record<string, unknown>;
  const result = c.result as Record<string, unknown> | undefined;
  const cfg = (result?.config ?? c.config ?? c) as Record<string, unknown>;
  
  const agentCount = (getNestedValue(cfg, ["agents", "list"]) as unknown[] | undefined)?.length ?? 0;
  const gatewayPort = getNestedValue(cfg, ["gateway", "port"]) as number | undefined;
  const gatewayMode = getNestedValue(cfg, ["gateway", "mode"]) as string | undefined;
  const telegramEnabled = getNestedValue(cfg, ["channels", "telegram", "enabled"]) as boolean | undefined;
  const slackEnabled = getNestedValue(cfg, ["channels", "slack", "enabled"]) as boolean | undefined;
  const defaultModel = getNestedValue(cfg, ["agents", "defaults", "model", "primary"]) as string | undefined;
  const heartbeatInterval = getNestedValue(cfg, ["agents", "defaults", "heartbeat", "every"]) as string | undefined;
  const version = getNestedValue(cfg, ["meta", "lastTouchedVersion"]) as string | undefined;
  const memoryBackend = getNestedValue(cfg, ["memory", "backend"]) as string | undefined;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium">Instance overview</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {version && (
          <div>
            <dt className="text-muted-foreground">OpenClaw version</dt>
            <dd>{version}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Agents configured</dt>
          <dd>{agentCount}</dd>
        </div>
        {defaultModel && (
          <div>
            <dt className="text-muted-foreground">Default model</dt>
            <dd className="font-mono text-xs">{defaultModel}</dd>
          </div>
        )}
        {gatewayPort && (
          <div>
            <dt className="text-muted-foreground">Gateway port</dt>
            <dd>{gatewayPort} ({gatewayMode ?? "local"})</dd>
          </div>
        )}
        {heartbeatInterval && (
          <div>
            <dt className="text-muted-foreground">Default heartbeat</dt>
            <dd>{heartbeatInterval}</dd>
          </div>
        )}
        {memoryBackend && (
          <div>
            <dt className="text-muted-foreground">Memory backend</dt>
            <dd>{memoryBackend}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Channels</dt>
          <dd>
            {[
              telegramEnabled && "Telegram",
              slackEnabled && "Slack",
            ]
              .filter(Boolean)
              .join(", ") || "None"}
          </dd>
        </div>
      </dl>
    </div>
  );
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

                <GatewayConfigSummary config={state.config} />
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
