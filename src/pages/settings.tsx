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

type SettingsState = {
  config: unknown;
  connection: GatewayConnection | null;
  connectionError: string | null;
  isLoading: boolean;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
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
    isLoading: true,
  });

  React.useEffect(() => {
    let isCurrent = true;

    async function loadSettings() {
      setState((currentState) => ({
        ...currentState,
        connectionError: null,
        isLoading: true,
      }));

      try {
        const config = await apiGet<GatewayConfigResponse>("/api/gateway/config");

        if (!isCurrent) {
          return;
        }

        setState({
          config: config?.config ?? null,
          connection: config?.connection ?? null,
          connectionError: null,
          isLoading: false,
        });
      } catch (error) {
        if (!isCurrent) {
          return;
        }

        setState({
          config: null,
          connection: null,
          connectionError: getErrorMessage(error),
          isLoading: false,
        });
      }
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
          Gateway connection details and client theme controls.
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
      </div>
    </>
  );
};

export default SettingsPage;
