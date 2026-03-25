import * as React from "react";

import { useAgents } from "@/hooks/useAgents";
import { type UsagePeriod, useUsage } from "@/hooks/useUsage";
import { cn } from "@/lib/utils";

type UsagePeriodLabel = "24h" | "3d" | "7d" | "30d";

const PERIOD_OPTIONS: Array<{ label: UsagePeriodLabel }> = [
  { label: "24h" },
  { label: "3d" },
  { label: "7d" },
  { label: "30d" },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function getAgentName(agentId: string, agents: ReturnType<typeof useAgents>["agents"]) {
  const agent = agents.find((item) => item.id === agentId);
  return agent?.name ?? agentId;
}

function getSelectedPeriod(
  periods: UsagePeriod[] | undefined,
  selectedLabel: UsagePeriodLabel,
): UsagePeriod | null {
  if (!periods || periods.length === 0) {
    return null;
  }

  return periods.find((period) => period.label === selectedLabel) ?? periods[0] ?? null;
}

export function UsagePanel() {
  const { agents } = useAgents();
  const { data, isLoading } = useUsage();
  const [selectedPeriodLabel, setSelectedPeriodLabel] = React.useState<UsagePeriodLabel>("24h");

  const selectedPeriod = React.useMemo(
    () => getSelectedPeriod(data?.periods, selectedPeriodLabel),
    [data?.periods, selectedPeriodLabel],
  );

  const rows = React.useMemo(() => {
    if (!selectedPeriod) {
      return [];
    }

    return selectedPeriod.byAgent.map((entry) => ({
      ...entry,
      agentName: getAgentName(entry.agentId, agents),
    }));
  }, [agents, selectedPeriod]);

  const summaryItems = selectedPeriod
    ? [
        {
          label: "Total Tokens",
          value: formatTokens(selectedPeriod.totalTokens),
        },
        {
          label: "Estimated Cost",
          value: formatCost(selectedPeriod.totalCost),
        },
        {
          label: "Sessions",
          value: selectedPeriod.sessionCount.toString(),
        },
      ]
    : [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/50 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Token Usage
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Aggregate token consumption and estimated spend by agent.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_OPTIONS.map((period) => {
              const isActive = period.label === selectedPeriod?.label;

              return (
                <button
                  key={period.label}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-50",
                  )}
                  onClick={() => setSelectedPeriodLabel(period.label)}
                  type="button"
                >
                  {period.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {isLoading && !selectedPeriod ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading usage data...</div>
        ) : null}

        {!isLoading && !selectedPeriod ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            No token usage data available yet.
          </div>
        ) : null}

        {selectedPeriod ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {summaryItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700/50 dark:bg-slate-800/50"
                >
                  <p className="text-[11px] font-medium tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-sm text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/30 dark:text-slate-400">
                No tracked usage for the selected period.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700/50">
                <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-medium tracking-[0.18em] text-slate-500 uppercase dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-400">
                  <span>Agent</span>
                  <span>Tokens</span>
                  <span>Cost</span>
                  <span>Sessions</span>
                </div>
                <ul className="divide-y divide-slate-200 dark:divide-slate-700/50">
                  {rows.map((row) => (
                    <li
                      key={row.agentId}
                      className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-200"
                    >
                      <span className="truncate font-medium text-slate-950 dark:text-slate-50">
                        {row.agentName}
                      </span>
                      <span>{formatTokens(row.totalTokens)}</span>
                      <span>{formatCost(row.totalCost)}</span>
                      <span>{row.sessionCount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
