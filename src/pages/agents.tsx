import React from "react";

import { AgentGrid, AgentTree } from "@/components/agents/agent-tree";
import { PageHeader } from "@/components/layout/page-header/page-header";
import { PageHeaderActions } from "@/components/layout/page-header/page-header-actions";
import { PageHeaderRow } from "@/components/layout/page-header/page-header-row";
import { PageHeaderTitle } from "@/components/layout/page-header/page-header-title";
import { ChatPanelToggle } from "@/components/layout/chat-panel-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgents, type AgentsStatus } from "@/hooks/useAgents";
import type { Agent } from "@/lib/types";

export type AgentViewMode = "grid" | "tree";

export const DEFAULT_AGENT_VIEW_MODE: AgentViewMode = "tree";

const AgentsPage = () => {
  const { agents, isLoading, status } = useAgents();

  return (
    <AgentsPageContent agents={agents} isLoading={isLoading} status={status} />
  );
};

export const AgentsPageContent = ({
  agents,
  initialViewMode = DEFAULT_AGENT_VIEW_MODE,
  isLoading,
  status,
}: {
  agents: Agent[];
  initialViewMode?: AgentViewMode;
  isLoading: boolean;
  status: AgentsStatus;
}) => {
  const [viewMode, setViewMode] = React.useState<AgentViewMode>(initialViewMode);

  return (
    <>
      <PageHeader>
        <PageHeaderRow>
          <PageHeaderTitle>Squad</PageHeaderTitle>
          <PageHeaderActions>
            <ChatPanelToggle />
          </PageHeaderActions>
        </PageHeaderRow>
      </PageHeader>

      <div className="space-y-8">
        {/* Agents section */}
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              Your AI agents and their current status.
            </p>

            <div
              aria-label="Agent view"
              className="inline-flex items-center gap-1 rounded-lg border p-1"
              role="group"
            >
              <Button
                aria-pressed={viewMode === "tree"}
                onClick={() => setViewMode("tree")}
                size="sm"
                type="button"
                variant={viewMode === "tree" ? "secondary" : "ghost"}
              >
                Tree
              </Button>
              <Button
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                size="sm"
                type="button"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
              >
                Grid
              </Button>
            </div>
          </div>

          {status === "idle" || isLoading ? (
            <div className="flex flex-wrap gap-4">
              {[1, 2, 3, 4].map((i) => (
                <AgentCardSkeleton key={i} />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <p className="text-muted-foreground">No agents registered yet.</p>
          ) : (
            <div data-view-mode={viewMode}>
              {viewMode === "tree" ? (
                <AgentTree agents={agents} />
              ) : (
                <AgentGrid agents={agents} />
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
};

const AgentCardSkeleton = () => {
  return (
    <div className="flex w-52 flex-col rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mb-1 h-5 w-20" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-auto h-3 w-32 pt-4" />
    </div>
  );
};

export default AgentsPage;
