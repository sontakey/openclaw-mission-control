import React, { type ComponentType, type SVGProps } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export const sidebarMenuButtonActiveStyles =
  "font-normal data-[active=true]:bg-transparent data-[active=true]:font-normal data-[active=true]:text-pink-600 data-[active=true]:hover:bg-pink-600/5 dark:data-[active=true]:bg-transparent dark:data-[active=true]:text-pink-400 dark:data-[active=true]:hover:bg-pink-400/5";

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  title: string;
  url: string;
  icon: NavIcon;
  onClick?: () => void;
  badge?: string;
  disabled?: boolean;
}

const navSectionOrder = ["OVERVIEW", "TOOLS", "SYSTEM"] as const;

const navSectionByUrl: Record<string, (typeof navSectionOrder)[number]> = {
  "/": "OVERVIEW",
  "/board": "OVERVIEW",
  "/agents": "OVERVIEW",
  "/chat": "TOOLS",
  "/crons": "TOOLS",
  "/settings": "SYSTEM",
};

interface NavMainProps {
  items: NavItem[];
}

export const NavMain = ({ items }: NavMainProps) => {
  const { pathname } = useLocation();

  const isActive = (url: string) => {
    if (url === "/") return pathname === "/";
    return pathname.startsWith(url);
  };

  const sections = navSectionOrder
    .map((title) => ({
      title,
      items: items.filter((item) => navSectionByUrl[item.url] === title),
    }))
    .filter((section) => section.items.length > 0);

  const renderItem = (item: NavItem) => {
    const content = (
      <>
        <item.icon />
        <span>{item.title}</span>
      </>
    );

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild={!item.onClick && !item.disabled}
          onClick={item.disabled ? undefined : item.onClick}
          isActive={!item.disabled && isActive(item.url)}
          tooltip={
            item.badge
              ? {
                  children: (
                    <>
                      {item.title}{" "}
                      <span className="text-background/70 text-xs">
                        ({item.badge})
                      </span>
                    </>
                  ),
                }
              : item.title
          }
          className={cn(sidebarMenuButtonActiveStyles, {
            "cursor-default opacity-50 hover:bg-transparent": item.disabled,
          })}
        >
          {item.onClick || item.disabled ? (
            content
          ) : (
            <Link to={item.url}>{content}</Link>
          )}
        </SidebarMenuButton>
        {item.badge && (
          <SidebarMenuBadge className="bg-muted text-muted-foreground! rounded px-1.5 text-[10px] font-medium">
            {item.badge}
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <>
      {sections.map((section) => (
        <SidebarGroup
          key={section.title}
          className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0"
        >
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold tracking-[0.18em]">
            {section.title}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{section.items.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
};
