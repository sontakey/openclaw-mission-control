import React from "react";

import { Badge } from "@/components/ui/badge";
import { deriveStatus, type AgentStatus } from "@/lib/agents";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AgentTreeProps = {
  agents: Agent[];
  className?: string;
};

export type AgentTreeNode = {
  agent: Agent;
  children: AgentTreeNode[];
};

type OrganizedAgents = {
  roots: AgentTreeNode[];
  standalone: Agent[];
};

const statusConfig: Record<
  AgentStatus,
  { dotColor: string; tone: string; label: string; variant: "outline" | "secondary" }
> = {
  online: {
    dotColor: "bg-emerald-500",
    label: "Online",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    variant: "secondary",
  },
  offline: {
    dotColor: "bg-slate-400",
    label: "Offline",
    tone: "text-muted-foreground",
    variant: "outline",
  },
};

export const formatLastSeen = (timestamp?: number | null): string => {
  if (!timestamp) return "Never";

  const minutes = Math.floor((Date.now() - timestamp) / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
};

export function organizeAgents(agents: Agent[]): OrganizedAgents {
  const agentsById = new Map(
    agents.map((agent, index) => [agent.id, { agent, index }] as const),
  );
  const childIds = new Set<string>();
  const childrenByParent = new Map<string, Agent[]>();

  for (const agent of agents) {
    if (!agent.parentId || agent.parentId === agent.id) {
      continue;
    }

    if (!agentsById.has(agent.parentId)) {
      continue;
    }

    childIds.add(agent.id);
    const children = childrenByParent.get(agent.parentId) ?? [];
    children.push(agent);
    childrenByParent.set(agent.parentId, children);
  }

  for (const [parentId, children] of childrenByParent) {
    const order = new Map(
      (agentsById.get(parentId)?.agent.children ?? []).map((childId, index) => [
        childId,
        index,
      ]),
    );

    children.sort((left, right) => {
      const leftOrder = order.get(left.id);
      const rightOrder = order.get(right.id);

      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }

      if (leftOrder !== undefined) {
        return -1;
      }

      if (rightOrder !== undefined) {
        return 1;
      }

      return (agentsById.get(left.id)?.index ?? 0) - (agentsById.get(right.id)?.index ?? 0);
    });
  }

  const buildNode = (agent: Agent, lineage = new Set<string>()): AgentTreeNode => {
    if (lineage.has(agent.id)) {
      return { agent, children: [] };
    }

    const nextLineage = new Set(lineage);
    nextLineage.add(agent.id);

    return {
      agent,
      children: (childrenByParent.get(agent.id) ?? []).map((child) =>
        buildNode(child, nextLineage),
      ),
    };
  };

  const roots: AgentTreeNode[] = [];
  const standalone: Agent[] = [];

  for (const agent of agents) {
    if (childIds.has(agent.id)) {
      continue;
    }

    if ((childrenByParent.get(agent.id)?.length ?? 0) > 0) {
      roots.push(buildNode(agent));
      continue;
    }

    standalone.push(agent);
  }

  return { roots, standalone };
}

function getDirectReportCounts(agents: Agent[]) {
  const agentIds = new Set(agents.map((agent) => agent.id));
  const directReportCounts = new Map<string, number>();

  for (const agent of agents) {
    if (!agent.parentId || agent.parentId === agent.id || !agentIds.has(agent.parentId)) {
      continue;
    }

    directReportCounts.set(
      agent.parentId,
      (directReportCounts.get(agent.parentId) ?? 0) + 1,
    );
  }

  return directReportCounts;
}

export const AgentTree = ({ agents, className }: AgentTreeProps) => {
  const { roots, standalone } = organizeAgents(agents);

  return (
    <div className={cn("space-y-8", className)}>
      {roots.length > 0 ? (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Hierarchy</h2>
            <p className="text-muted-foreground text-sm">
              Reporting lines and active work across the squad.
            </p>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="inline-flex min-w-full flex-col gap-10 px-4">
              {roots.map((root) => (
                <AgentBranch key={root.agent.id} node={root} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {standalone.length > 0 ? (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">
              Standalone agents
            </h2>
            <p className="text-muted-foreground text-sm">
              Agents without a current place in the reporting tree.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            {standalone.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export const AgentGrid = ({ agents, className }: AgentTreeProps) => {
  const directReportCounts = getDirectReportCounts(agents);

  return (
    <div className={cn("flex flex-wrap gap-4", className)}>
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          childCount={directReportCounts.get(agent.id) ?? 0}
        />
      ))}
    </div>
  );
};

const AgentBranch = ({ node }: { node: AgentTreeNode }) => {
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      <AgentCard agent={node.agent} childCount={node.children.length} />

      {hasChildren ? (
        <>
          <div aria-hidden="true" className="bg-border h-6 w-px" />

          <div className="relative flex flex-wrap justify-center gap-x-6 gap-y-8 pt-6">
            {node.children.length > 1 ? (
              <div
                aria-hidden="true"
                className="bg-border absolute top-0 left-8 right-8 h-px"
              />
            ) : null}

            {node.children.map((child) => (
              <div
                key={child.agent.id}
                className="relative flex min-w-[18rem] justify-center pt-6"
              >
                <div
                  aria-hidden="true"
                  className="bg-border absolute top-0 left-1/2 h-6 w-px -translate-x-1/2"
                />
                <AgentBranch node={child} />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};

export const AgentCard = ({
  agent,
  childCount = 0,
}: {
  agent: Agent;
  childCount?: number;
}) => {
  const status = deriveStatus({
    lastHeartbeat: agent.lastHeartbeat ?? undefined,
    status: agent.status,
  });
  const config = statusConfig[status];
  const task = agent.currentTask;
  const taskSummary = task ? task.title : (agent.currentActivity?.trim() || null);

  return (
    <details className="w-[18rem] rounded-2xl [&_summary::-webkit-details-marker]:hidden">
      <summary className="list-none">
        <div className="bg-card text-card-foreground flex min-h-48 flex-col rounded-2xl border border-border/70 bg-gradient-to-b from-card via-card to-muted/40 p-4 shadow-sm transition hover:border-brand/40 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <span className="text-3xl leading-none">{agent.emoji}</span>
            <Badge
              variant={config.variant}
              className={cn("gap-1.5", config.tone)}
            >
              <span
                aria-hidden="true"
                className={cn("h-1.5 w-1.5 rounded-full", config.dotColor)}
              />
              {config.label}
            </Badge>
          </div>

          <div className="mt-4 space-y-1">
            <h3 className="text-base font-semibold tracking-tight">{agent.name}</h3>
            <p className="text-muted-foreground text-sm">{agent.role}</p>
          </div>

          <div className="mt-5 space-y-2">
            {task ? (
              <>
                <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.2em]">
                  Current task
                </p>
                <div className="mt-0.5">
                  <span className={cn(
                    "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase mr-1.5",
                    task.status === "in_progress" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                    task.status === "review" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" :
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  )}>
                    {task.status.replace("_", " ")}
                  </span>
                  <p className="text-sm mt-1 line-clamp-2">{task.title}</p>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm italic">No task</p>
            )}
          </div>

          <div className="text-muted-foreground mt-auto flex items-center justify-between pt-5 text-xs">
            <span>{childCount > 0 ? `${childCount} report${childCount === 1 ? "" : "s"}` : "Individual contributor"}</span>
            <span>Click for details</span>
          </div>
        </div>
      </summary>

      <div className="bg-muted/50 mt-3 space-y-3 rounded-2xl border border-dashed p-4 text-sm">
        <DetailRow label="Session" value={agent.sessionKey ?? "Unavailable"} />
        <DetailRow
          label="Delegates"
          value={agent.delegatesTo.length > 0 ? String(agent.delegatesTo.length) : "None"}
        />
        <DetailRow
          label="Last seen"
          value={formatLastSeen(agent.lastHeartbeat)}
        />
      </div>
    </details>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[10rem] truncate text-right font-medium">{value}</span>
    </div>
  );
};
