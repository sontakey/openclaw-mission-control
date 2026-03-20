import React, { type ComponentProps } from "react";
import lucideIcons from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const Menu = lucideIcons.Menu;
const PanelLeftClose = lucideIcons.PanelLeftClose;
const PanelLeftOpen = lucideIcons.PanelLeftOpen;

export function SidebarToggle({
  className,
  ...props
}: ComponentProps<typeof Button>) {
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
