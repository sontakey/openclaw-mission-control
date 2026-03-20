import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgents } from "@/hooks/useAgents";
import { useChat } from "@/hooks/use-chat";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { ChatHeader } from "./chat-header";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { ChatScrollButton } from "./chat-scroll-button";
import type { ChatAttachment } from "./types";

export type ChatProps = {
  sessionKey: string;
  mode?: "panel" | "full";
  onClose?: () => void;
  className?: string;
  /** Hide the header (title and border) */
  hideHeader?: boolean;
  /** Auto-send this message when history is empty after loading */
  autoSendMessage?: string;
};

function formatSessionLabel(sessionKey: string) {
  const [, agentId = sessionKey, channel] = sessionKey.split(":");
  return channel ? `${agentId} (${channel})` : agentId;
}

export const Chat = ({
  sessionKey,
  mode = "full",
  onClose,
  className,
  hideHeader = false,
  autoSendMessage,
}: ChatProps) => {
  const { agents, isLoading: isLoadingAgents } = useAgents();
  const [selectedSessionKey, setSelectedSessionKey] = useState(sessionKey);
  const agentOptions = useMemo(() => {
    const options = agents
      .filter((agent) => agent.sessionKey)
      .map((agent) => ({
        label: `${agent.emoji ? `${agent.emoji} ` : ""}${agent.name}`,
        sessionKey: agent.sessionKey as string,
      }));

    if (!options.some((option) => option.sessionKey === sessionKey)) {
      options.unshift({
        label: formatSessionLabel(sessionKey),
        sessionKey,
      });
    }

    return options;
  }, [agents, sessionKey]);
  const activeSessionKey = selectedSessionKey || sessionKey;
  const {
    messages,
    input,
    setInput,
    error,
    sendMessage,
    abort,
    isLoading,
    isStreaming,
  } = useChat({ sessionKey: activeSessionKey });

  const { scrollRef, showScrollButton, scrollToBottom } = useAutoScroll();
  const autoSendTriggered = useRef(false);

  useEffect(() => {
    setSelectedSessionKey(sessionKey);
  }, [sessionKey]);

  useEffect(() => {
    if (
      agentOptions.length > 0 &&
      !agentOptions.some((option) => option.sessionKey === selectedSessionKey)
    ) {
      setSelectedSessionKey(agentOptions[0].sessionKey);
    }
  }, [agentOptions, selectedSessionKey]);

  useEffect(() => {
    autoSendTriggered.current = false;
  }, [activeSessionKey]);

  useEffect(() => {
    if (
      autoSendMessage &&
      !autoSendTriggered.current &&
      !isLoading &&
      messages.length === 0
    ) {
      autoSendTriggered.current = true;
      sendMessage(autoSendMessage);
    }
  }, [autoSendMessage, isLoading, messages.length, sendMessage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mode === "panel" && onClose) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, onClose]);

  useEffect(() => {
    scrollToBottom(messages.length > 0 ? "smooth" : "auto");
  }, [isStreaming, messages.length, scrollToBottom]);

  const handleSend = async (text: string, attachments?: ChatAttachment[]) => {
    await sendMessage(text, attachments);
  };

  const handleStop = () => {
    abort();
  };

  return (
    <div
      className={cn(
        "bg-background flex h-full flex-col",
        mode === "panel" && "border-l",
        mode === "full" && "mx-auto w-full max-w-5xl px-4 md:px-6 lg:px-8",
        className,
      )}
    >
      {!hideHeader && (
        <ChatHeader
          agentOptions={agentOptions}
          disabled={isLoadingAgents}
          mode={mode}
          onClose={onClose}
          onSessionKeyChange={setSelectedSessionKey}
          isStreaming={isStreaming}
          selectedSessionKey={activeSessionKey}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            isStreaming={isStreaming}
            error={error}
          />
        </div>

        {showScrollButton && (
          <ChatScrollButton onClick={() => scrollToBottom()} />
        )}
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onStop={handleStop}
        isLoading={isLoading}
        isStreaming={isStreaming}
      />
    </div>
  );
};
