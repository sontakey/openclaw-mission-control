import * as React from "react";
import { Bot, Settings, SquareKanban } from "lucide-react";
import { useLocation } from "react-router-dom";

import { NavMain, type NavItem } from "./nav-main";
import { isLockedSidebarRoute } from "./sidebar-config";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";


const navItems: NavItem[] = [
  {
    title: "Board",
    url: "/",
    icon: SquareKanban,
  },
  {
    title: "Agents",
    url: "/agents",
    icon: Bot,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export const DashboardSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
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
      </SidebarContent>
      {!hideRail && <SidebarRail />}
    </Sidebar>
  );
};
