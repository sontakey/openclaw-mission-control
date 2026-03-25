import React from "react";

import { Badge } from "@/components/ui/badge";
import { deriveStatus, type AgentStatus } from "@/lib/agents";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";

const agentStatusConfig: Record<
  AgentStatus,
  { dot: string; label: string; tone: string; variant: "outline" | "secondary" }
> = {
  offline: {
    dot: "bg-slate-400",
    label: "Offline",
    tone: "text-muted-foreground",
    variant: "outline",
  },
  online: {
    dot: "bg-emerald-500",
    label: "Online",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    variant: "secondary",
  },
};

function formatStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function getTaskStatusTone(status: string) {
  if (status === "in_progress") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  }

  if (status === "review") {
    return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
  }

  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
}

export const BoardAgentStatusList = ({ agents }: { agents: Agent[] }) => {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/50 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
          Agent Status
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Live squad availability with current task context.
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
          No agents are reporting yet.
        </div>
      ) : (
        <ul className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const status = deriveStatus({
              lastHeartbeat: agent.lastHeartbeat ?? undefined,
              status: agent.status,
            });
            const statusConfig = agentStatusConfig[status];
            const currentActivity = agent.currentActivity?.trim() || null;
            const currentTask = agent.currentTask;

            return (
              <li
                key={agent.id}
                className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700/50 dark:bg-slate-800/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-xl leading-none">
                        {agent.emoji}
                      </span>
                      <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
                        {agent.name}
                      </h3>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      {agent.role}
                    </p>
                  </div>

                  <Badge variant={statusConfig.variant} className={cn("gap-1.5", statusConfig.tone)}>
                    <span
                      aria-hidden="true"
                      className={cn("h-1.5 w-1.5 rounded-full", statusConfig.dot)}
                    />
                    {statusConfig.label}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-medium tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
                      {currentTask ? "Current task" : "Current activity"}
                    </p>
                    {currentTask ? (
                      <span
                        className={cn(
                          "inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                          getTaskStatusTone(currentTask.status),
                        )}
                      >
                        {formatStatusLabel(currentTask.status)}
                      </span>
                    ) : null}
                  </div>

                  <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                    {currentTask?.title ?? currentActivity ?? "Idle"}
                  </p>

                  {currentTask && currentActivity ? (
                    <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {currentActivity}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
