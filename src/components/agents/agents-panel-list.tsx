import { ScrollArea } from "@/components/ui/scroll-area";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AgentsPanelItem } from "./agents-panel-item";

export type AgentsPanelListProps = {
  agents: Agent[];
  collapsed?: boolean;
  selectedAgentIds?: string[];
  onToggleAgent?: (agentId: string) => void;
};

export const AgentsPanelList = ({
  agents,
  collapsed = false,
  selectedAgentIds = [],
  onToggleAgent,
}: AgentsPanelListProps) => {
  return (
    <ScrollArea className="flex-1">
      <div className={cn("space-y-1", collapsed ? "px-1 py-2" : "p-2")}>
        {agents.map((agent) => (
          <AgentsPanelItem
            key={agent.id}
            agent={agent}
            collapsed={collapsed}
            selected={selectedAgentIds.includes(agent.id)}
            onToggle={() => onToggleAgent?.(agent.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
};
