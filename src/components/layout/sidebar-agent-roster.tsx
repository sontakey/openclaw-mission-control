import React from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";

const agentStatusDotClassName: Record<Agent["status"], string> = {
  offline: "bg-red-500",
  online: "bg-green-500",
};

type SidebarAgentRosterProps = {
  agents: Agent[];
  onSelectAgent?: (agent: Agent) => void;
  selectedAgentId?: string | null;
};

export const SidebarAgentRoster = ({
  agents,
  onSelectAgent,
  selectedAgentId = null,
}: SidebarAgentRosterProps) => {
  if (agents.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className="pt-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
      <SidebarGroupLabel>Agent roster</SidebarGroupLabel>
      <SidebarGroupContent>
        <ul
          aria-label="Agent roster"
          className="space-y-1 group-data-[collapsible=icon]:space-y-2"
        >
          {agents.map((agent) => {
            const selected = selectedAgentId === agent.id;
            const content = (
              <>
                <span aria-hidden="true" className="text-base leading-none">
                  {agent.emoji}
                </span>
                <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
                  {agent.name}
                </span>
                <span
                  aria-label={`${agent.name} is ${agent.status}`}
                  className={cn(
                    "size-2.5 shrink-0 rounded-full group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:bottom-1 group-data-[collapsible=icon]:ring-2 group-data-[collapsible=icon]:ring-sidebar",
                    agentStatusDotClassName[agent.status],
                  )}
                />
              </>
            );

            return (
              <li key={agent.id}>
                {onSelectAgent ? (
                  <button
                    aria-label={`Open agent details for ${agent.name}`}
                    aria-pressed={selected}
                    className={cn(
                      "relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2",
                      selected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/70",
                    )}
                    onClick={() => onSelectAgent(agent)}
                    type="button"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
