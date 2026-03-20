"use client";

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@clawe/ui/components/button";
import { useSidebar } from "@clawe/ui/components/sidebar";
import { cn } from "@clawe/ui/lib/utils";

export function SidebarToggle({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={toggleSidebar}
      {...props}
    >
      {isMobile ? (
        <Menu className="size-4" />
      ) : isCollapsed ? (
        <PanelLeftOpen className="size-4" />
      ) : (
        <PanelLeftClose className="size-4" />
      )}
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}
