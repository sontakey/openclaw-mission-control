import * as React from "react";

import { apiGet } from "@/lib/api";

export type UsageAgentSummary = {
  agentId: string;
  sessionCount: number;
  totalCost: number;
  totalTokens: number;
};

export type UsageModelSummary = {
  model: string;
  sessionCount: number;
  totalCost: number;
  totalTokens: number;
};

export type UsagePeriod = {
  byAgent: UsageAgentSummary[];
  byModel: UsageModelSummary[];
  label: string;
  sessionCount: number;
  totalCost: number;
  totalTokens: number;
};

export type UsageResponse = {
  periods: UsagePeriod[];
  updatedAt: number;
};

export function useUsage() {
  const [data, setData] = React.useState<UsageResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    const load = () => {
      void apiGet<UsageResponse>("/api/usage")
        .then((response) => {
          if (!isMounted || !response) {
            return;
          }

          setData(response);
        })
        .catch(() => {
          // Keep the panel quiet on transient fetch failures.
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
    };

    load();
    const intervalId = window.setInterval(load, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return { data, isLoading };
}
