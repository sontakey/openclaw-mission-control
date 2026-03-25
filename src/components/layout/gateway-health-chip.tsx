import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

type GatewayConnection = {
  hasToken: boolean;
  latencyMs?: number;
  status: string;
  url: string;
};

type GatewayHealthState = "healthy" | "loading" | "unhealthy";

const HEALTHY_STATUSES = new Set(["connected", "healthy", "ok"]);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load gateway status.";
}

function getGatewayHealthPresentation(
  connection: GatewayConnection | null,
  error: string | null,
  hasLoaded: boolean,
) {
  if (!hasLoaded) {
    return {
      detail: "Checking gateway connectivity.",
      dotClassName: "bg-amber-500",
      label: "Gateway checking",
      state: "loading" as GatewayHealthState,
    };
  }

  if (!connection || error) {
    return {
      detail: error ?? "Gateway config unavailable.",
      dotClassName: "bg-red-500",
      label: "Disconnected",
      state: "unhealthy" as GatewayHealthState,
    };
  }

  const normalizedStatus = connection.status.trim().toLowerCase();

  if (HEALTHY_STATUSES.has(normalizedStatus)) {
    return {
      detail: connection.url,
      dotClassName: "bg-emerald-500",
      label: "Gateway",
      state: "healthy" as GatewayHealthState,
    };
  }

  return {
    detail: connection.url,
    dotClassName: "bg-red-500",
    label: "Disconnected",
    state: "unhealthy" as GatewayHealthState,
  };
}

export function GatewayHealthChip() {
  const [connection, setConnection] = React.useState<GatewayConnection | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = React.useState(false);

  React.useEffect(() => {
    let isCurrent = true;

    async function loadGatewayHealth() {
      try {
        const response = await apiGet<GatewayConnection>("/api/gateway/health");

        if (!isCurrent) {
          return;
        }

        setConnection(response ?? null);
        setError(null);
      } catch (loadError) {
        if (!isCurrent) {
          return;
        }

        setConnection(null);
        setError(getErrorMessage(loadError));
      } finally {
        if (isCurrent) {
          setHasLoaded(true);
        }
      }
    }

    void loadGatewayHealth();

    return () => {
      isCurrent = false;
    };
  }, []);

  const presentation = getGatewayHealthPresentation(connection, error, hasLoaded);

  return (
    <Badge
      className="gap-2 rounded-full border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
      data-state={presentation.state}
      role="status"
      title={presentation.detail}
      variant="outline"
    >
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", presentation.dotClassName)}
      />
      <span>{presentation.label}</span>
    </Badge>
  );
}
