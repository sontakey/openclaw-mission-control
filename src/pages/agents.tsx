import React from "react";

import { AgentTree } from "@/components/agents/agent-tree";
import { PageHeader } from "@/components/layout/page-header/page-header";
import { PageHeaderActions } from "@/components/layout/page-header/page-header-actions";
import { PageHeaderRow } from "@/components/layout/page-header/page-header-row";
import { PageHeaderTitle } from "@/components/layout/page-header/page-header-title";
import { ChatPanelToggle } from "@/components/layout/chat-panel-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgents } from "@/hooks/useAgents";

const AgentsPage = () => {
  const { agents, isLoading, status } = useAgents();

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
          <p className="text-muted-foreground mb-4 text-sm">
            Your AI agents and their current status.
          </p>

          {status === "idle" || isLoading ? (
            <div className="flex flex-wrap gap-4">
              {[1, 2, 3, 4].map((i) => (
                <AgentCardSkeleton key={i} />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <p className="text-muted-foreground">No agents registered yet.</p>
          ) : (
            <AgentTree agents={agents} />
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
