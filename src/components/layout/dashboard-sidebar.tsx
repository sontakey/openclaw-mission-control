import * as React from "react";
// @ts-expect-error lucide-react type export mismatch (works at runtime)
import { Bot, Clock3, LayoutDashboard, MessageSquare, Settings, SquareKanban } from "lucide-react";
import { useLocation } from "react-router-dom";

import { NavMain, type NavItem } from "./nav-main";
import { SidebarAgentRoster } from "./sidebar-agent-roster";
import { isLockedSidebarRoute } from "./sidebar-config";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import type { Agent } from "@/lib/types";
import { useSquad } from "@/providers/squad-provider";

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Board",
    url: "/board",
    icon: SquareKanban,
  },
  {
    title: "Agents",
    url: "/agents",
    icon: Bot,
  },
  {
    title: "Chat",
    url: "/chat",
    icon: MessageSquare,
  },
  {
    title: "Crons",
    url: "/crons",
    icon: Clock3,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

type DashboardSidebarProps = React.ComponentProps<typeof Sidebar> & {
  onAgentSelect?: (agent: Agent) => void;
  selectedAgentId?: string | null;
};

export const DashboardSidebarContent = ({
  agents,
  onAgentSelect,
  selectedAgentId,
  ...props
}: DashboardSidebarProps & {
  agents: Agent[];
}) => {
  const { pathname } = useLocation();
  const hideRail = isLockedSidebarRoute(pathname);

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="h-12 justify-center group-data-[collapsible=icon]:px-0">
        <div className="flex min-h-9 items-center gap-2 overflow-hidden rounded-md px-2">
          <div className="bg-brand text-brand-foreground flex size-5 shrink-0 items-center justify-center rounded-sm text-xs font-semibold">
            M
          </div>
          <span className="truncate text-sm font-medium group-data-[collapsible=icon]:hidden">
            Mission Control
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="overflow-hidden">
        <NavMain items={navItems} />
        {agents.length > 0 ? (
          <>
            <SidebarSeparator />
            <SidebarAgentRoster
              agents={agents}
              onSelectAgent={onAgentSelect}
              selectedAgentId={selectedAgentId}
            />
          </>
        ) : null}
      </SidebarContent>
      {!hideRail && <SidebarRail />}
    </Sidebar>
  );
};

export const DashboardSidebar = ({
  onAgentSelect,
  selectedAgentId,
  ...props
}: DashboardSidebarProps) => {
  const { agents } = useSquad();

  return (
    <DashboardSidebarContent
      agents={agents}
      onAgentSelect={onAgentSelect}
      selectedAgentId={selectedAgentId}
      {...props}
    />
  );
};
