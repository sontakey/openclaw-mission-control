import React from "react";
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { AgentDetailDrawer } from "@/components/agents/agent-detail-drawer";
import { ChatPanel } from "@/components/layout/chat-panel";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { GatewayHealthChip } from "@/components/layout/gateway-health-chip";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Agent } from "@/lib/types";
import BoardPage from "@/pages/board";
import CronsPage from "@/pages/crons";
import AgentsPage from "@/pages/agents";
import ChatPage from "@/pages/chat";
import SettingsPage from "@/pages/settings";
import { ChatPanelProvider } from "@/providers/chat-panel-provider";
import { DrawerProvider } from "@/providers/drawer-provider";
import { SquadProvider, useSquad } from "@/providers/squad-provider";
import { ThemeProvider } from "@/providers/theme-provider";

function AppLayout() {
  const { pathname } = useLocation();
  const { agents } = useSquad();
  const showChatPanel = !pathname.startsWith("/chat");
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
  const selectedAgent = React.useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  React.useEffect(() => {
    if (selectedAgentId && !selectedAgent) {
      setSelectedAgentId(null);
    }
  }, [selectedAgent, selectedAgentId]);

  const handleAgentSelect = React.useCallback((agent: Agent) => {
    setSelectedAgentId(agent.id);
  }, []);

  const handleCloseAgentDetails = React.useCallback(() => {
    setSelectedAgentId(null);
  }, []);

  return (
    <SidebarProvider defaultOpen={false}>
      <DashboardSidebar
        onAgentSelect={handleAgentSelect}
        selectedAgentId={selectedAgentId}
      />
      <SidebarInset className="relative min-h-screen">
        <div className="flex min-h-screen flex-col">
          <header className="bg-background flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
            <SidebarToggle />
            <GatewayHealthChip />
          </header>
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-auto bg-slate-50 p-4 text-slate-900 sm:p-6 dark:bg-slate-900 dark:text-slate-50">
              <Routes>
                <Route path="/" element={<BoardPage />} />
                <Route path="/board" element={<BoardPage />} />
                <Route
                  path="/agents"
                  element={
                    <AgentsPage
                      onAgentSelect={handleAgentSelect}
                      selectedAgentId={selectedAgentId}
                    />
                  }
                />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/crons" element={<CronsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </main>
            {showChatPanel ? <ChatPanel /> : null}
          </div>
        </div>
        <AgentDetailDrawer
          agent={selectedAgent}
          onClose={handleCloseAgentDetails}
          open={selectedAgent !== null}
        />
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
