import * as React from "react";

import { apiGet, apiPost } from "../lib/api";

export type MessageRole = "assistant" | "system" | "user";

export type Message = {
  content: string;
  createdAt?: number | null;
  id: string;
  role: MessageRole;
};

export type ChatStatus = "error" | "idle" | "loading" | "streaming";

type ChatSnapshot = {
  error: Error | null;
  input: string;
  isLoading: boolean;
  isStreaming: boolean;
  messages: Message[];
  status: ChatStatus;
};

type OutgoingAttachment = {
  mimeType: string;
  name: string;
};

type SendResponse = {
  content?: string;
  message?: string;
  response?: string;
};

export type ChatApi = {
  loadHistory(sessionKey: string): Promise<Message[]>;
  sendMessage(sessionKey: string, message: string): Promise<unknown>;
};

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMessage(message: Message, index: number): Message {
  return {
    content: message.content,
    createdAt: message.createdAt ?? null,
    id: message.id || `message-${index}`,
    role: message.role,
  };
}

export function buildOutgoingMessage(
  text: string,
  attachments?: OutgoingAttachment[],
) {
  const trimmedText = text.trim();
  const attachmentLines =
    attachments?.map(
      (attachment) =>
        `[Attachment: ${attachment.name} (${attachment.mimeType})]`,
    ) ?? [];

  return [trimmedText, ...attachmentLines].filter(Boolean).join("\n\n");
}

export function getAssistantResponseText(response: unknown) {
  if (typeof response === "string") {
    const trimmed = response.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!response || typeof response !== "object") {
    return null;
  }

  const candidate = response as SendResponse;

  for (const value of [candidate.response, candidate.message, candidate.content]) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();

    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

export function createChatApi(): ChatApi {
  return {
    async loadHistory(sessionKey) {
      return (
        (await apiGet<Message[]>(
          `/api/chat/history?sessionKey=${encodeURIComponent(sessionKey)}`,
        )) ?? []
      );
    },
    async sendMessage(sessionKey, message) {
      return apiPost("/api/chat/send", { message, sessionKey });
    },
  };
}

export class ChatStore {
  private readonly api: ChatApi;
  private readonly listeners = new Set<() => void>();

  private historyRequestId = 0;
  private sendRequestId = 0;
  private sessionKey: string;
  private state: ChatSnapshot = {
    error: null,
    input: "",
    isLoading: false,
    isStreaming: false,
    messages: [],
    status: "idle",
  };

  constructor({
    api = createChatApi(),
    sessionKey,
  }: {
    api?: ChatApi;
    sessionKey: string;
  }) {
    this.api = api;
    this.sessionKey = sessionKey;
  }

  subscribeStore = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  setInput = (input: string) => {
    this.setState({
      ...this.state,
      input,
    });
  };

  setSessionKey = (sessionKey: string) => {
    if (sessionKey === this.sessionKey) {
      return;
    }

    this.sessionKey = sessionKey;
    this.historyRequestId += 1;
    this.sendRequestId += 1;

    this.setState({
      ...this.state,
      error: null,
      isLoading: false,
      isStreaming: false,
      messages: [],
      status: "idle",
    });
  };

  loadHistory = () => this.loadHistoryInternal();

  refreshHistory = () => this.loadHistoryInternal({ background: true });

  sendMessage = async (text: string, attachments?: OutgoingAttachment[]) => {
    const message = buildOutgoingMessage(text, attachments);

    if (!message || !this.sessionKey.trim()) {
      return null;
    }

    const requestId = ++this.sendRequestId;
    const optimisticMessage: Message = {
      content: message,
      createdAt: Date.now(),
      id: createMessageId("user"),
      role: "user",
    };

    this.setState({
      ...this.state,
      error: null,
      input: "",
      isStreaming: true,
      messages: [...this.state.messages, optimisticMessage],
      status: "streaming",
    });

    try {
      const response = await this.api.sendMessage(this.sessionKey, message);

      if (requestId !== this.sendRequestId) {
        return response;
      }

      const assistantText = getAssistantResponseText(response);

      this.setState({
        ...this.state,
        error: null,
        isStreaming: false,
        messages: assistantText
          ? [
              ...this.state.messages,
              {
                content: assistantText,
                createdAt: Date.now(),
                id: createMessageId("assistant"),
                role: "assistant",
              },
            ]
          : this.state.messages,
        status: "idle",
      });

      return response;
    } catch (error) {
      if (requestId !== this.sendRequestId) {
        return null;
      }

      const nextError = toError(error);

      this.setState({
        ...this.state,
        error: nextError,
        isStreaming: false,
        status: "error",
      });

      throw nextError;
    }
  };

  abort = () => {
    this.sendRequestId += 1;

    this.setState({
      ...this.state,
      isStreaming: false,
      status: this.state.isLoading ? "loading" : "idle",
    });
  };

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private setState(state: ChatSnapshot) {
    this.state = state;
    this.notify();
  }

  private async loadHistoryInternal({
    background = false,
  }: {
    background?: boolean;
  } = {}) {
    const sessionKey = this.sessionKey.trim();

    if (!sessionKey) {
      this.setState({
        ...this.state,
        error: null,
        isLoading: false,
        messages: [],
        status: "idle",
      });
      return [];
    }

    const requestId = ++this.historyRequestId;

    if (!background) {
      this.setState({
        ...this.state,
        error: null,
        isLoading: true,
        status: "loading",
      });
    }

    try {
      const messages = (await this.api.loadHistory(sessionKey)).map(normalizeMessage);

      if (requestId !== this.historyRequestId || sessionKey !== this.sessionKey) {
        return messages;
      }

      this.setState({
        ...this.state,
        error: null,
        isLoading: false,
        messages,
        status: this.state.isStreaming ? "streaming" : "idle",
      });

      return messages;
    } catch (error) {
      if (requestId !== this.historyRequestId || sessionKey !== this.sessionKey) {
        return [];
      }

      const nextError = toError(error);

      this.setState({
        ...this.state,
        error: nextError,
        isLoading: false,
        status: "error",
      });

      throw nextError;
    }
  }
}

export function useChat(options: string | {
  sessionKey: string;
  pollIntervalMs?: number;
  api?: ChatApi;
}) {
  const {
    sessionKey,
    pollIntervalMs = 5_000,
    api,
  } = typeof options === "string" ? { sessionKey: options } : options;
  const store = React.useMemo(
    () => new ChatStore({ api, sessionKey }),
    [api, sessionKey],
  );
  const snapshot = React.useSyncExternalStore(
    store.subscribeStore,
    store.getSnapshot,
    store.getSnapshot,
  );

  React.useEffect(() => {
    store.setSessionKey(sessionKey);
    void store.loadHistory();

    const intervalId = window.setInterval(() => {
      void store.refreshHistory();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
      store.abort();
    };
  }, [pollIntervalMs, sessionKey, store]);

  return React.useMemo(
    () => ({
      ...snapshot,
      abort: store.abort,
      loadHistory: store.loadHistory,
      sendMessage: store.sendMessage,
      setInput: store.setInput,
    }),
    [snapshot, store],
  );
}
