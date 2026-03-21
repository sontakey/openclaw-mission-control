import * as React from "react";

import { Chat } from "@/components/chat";
import {
  PageHeader,
  PageHeaderRow,
  PageHeaderTitle,
} from "@/components/layout/page-header";
import { useAgents } from "@/hooks/useAgents";
import type { Agent } from "@/lib/types";

const FALLBACK_CHAT_SESSION_KEY = "agent:main:main";

export function getDefaultChatSessionKey(agents: Pick<Agent, "sessionKey">[]) {
  const sessionKeys = agents
    .map((agent) => agent.sessionKey)
    .filter((sessionKey): sessionKey is string => Boolean(sessionKey));

  return (
    sessionKeys.find((sessionKey) => sessionKey.endsWith(":main")) ??
    sessionKeys[0] ??
    FALLBACK_CHAT_SESSION_KEY
  );
}

export const ChatPageContent = ({
  sessionKey,
}: {
  sessionKey: string;
}) => {
  return (
    <>
      <PageHeader>
        <PageHeaderRow>
          <PageHeaderTitle>Chat</PageHeaderTitle>
        </PageHeaderRow>
      </PageHeader>

      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Message agent sessions without leaving Mission Control.
        </p>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <Chat
            className="h-[70vh] max-w-none px-0 md:px-0 lg:px-0"
            mode="full"
            sessionKey={sessionKey}
          />
        </section>
      </div>
    </>
  );
};

const ChatPage = () => {
  const { agents } = useAgents();
  const sessionKey = React.useMemo(() => getDefaultChatSessionKey(agents), [agents]);

  return <ChatPageContent sessionKey={sessionKey} />;
};

export default ChatPage;
