import React from "react";
import { cn } from "@/lib/utils";
import { Chat } from "@/components/chat";
import { useChatPanel } from "@/providers/chat-panel-provider";

export const ChatPanel = () => {
  const { isOpen, close } = useChatPanel();
  const [agents, setAgents] = React.useState<Array<{id: string; name: string; emoji: string; sessionKey: string | null}>>([]);
  const [selectedAgent, setSelectedAgent] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    fetch("/api/agents")
      .then(r => r.json())
      .then((data: Array<{id: string; name: string; emoji: string; sessionKey: string | null; status: string}>) => {
        setAgents(data);
        // Default to the first agent with a session, or the default agent
        if (!selectedAgent && data.length > 0) {
          const defaultAgent = data.find(a => a.sessionKey?.includes(":main"));
          setSelectedAgent(defaultAgent?.sessionKey ?? data[0]?.sessionKey ?? null);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const sessionKey = selectedAgent ?? "agent:main:main";

  return (
    <div
      className={cn(
        "bg-sidebar hidden h-full shrink-0 overflow-hidden py-2 transition-all duration-200 ease-out md:block",
        isOpen ? "ml-1 w-96 pr-2 opacity-100" : "w-0 opacity-0",
      )}
    >
      {isOpen && (
        <div className="bg-background flex h-full flex-col overflow-hidden rounded-xl border">
          {agents.length > 1 && (
            <div className="border-b px-3 py-2">
              <select
                value={sessionKey}
                onChange={e => setSelectedAgent(e.target.value)}
                className="bg-background text-sm w-full rounded border px-2 py-1"
              >
                {agents.filter(a => a.sessionKey).map(a => (
                  <option key={a.id} value={a.sessionKey!}>
                    {a.emoji} {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Chat
            sessionKey={sessionKey}
            mode="panel"
            onClose={close}
            className="h-full border-l-0"
          />
        </div>
      )}
    </div>
  );
};
