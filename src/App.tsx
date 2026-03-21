import React from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";

import { ChatPanel } from "@/components/layout/chat-panel";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import BoardPage from "@/pages/board";
import CronsPage from "@/pages/crons";
import AgentsPage from "@/pages/agents";
import ChatPage from "@/pages/chat";
import SettingsPage from "@/pages/settings";
import { ChatPanelProvider } from "@/providers/chat-panel-provider";
import { DrawerProvider } from "@/providers/drawer-provider";
import { SquadProvider } from "@/providers/squad-provider";
import { ThemeProvider } from "@/providers/theme-provider";

function AppLayout() {
  const { pathname } = useLocation();
  const showChatPanel = !pathname.startsWith("/chat");

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset className="min-h-screen">
        <div className="flex min-h-screen flex-col">
          <header className="bg-background flex h-12 shrink-0 items-center border-b px-4">
            <SidebarToggle />
          </header>
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-auto bg-slate-50 p-6 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
              <Routes>
                <Route path="/" element={<BoardPage />} />
                <Route path="/board" element={<BoardPage />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/crons" element={<CronsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </main>
            {showChatPanel ? <ChatPanel /> : null}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function AppShell() {
  return (
    <ThemeProvider>
      <SquadProvider>
        <ChatPanelProvider>
          <DrawerProvider>
            <AppLayout />
          </DrawerProvider>
        </ChatPanelProvider>
      </SquadProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
