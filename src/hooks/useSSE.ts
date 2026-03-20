import * as React from "react";

import type { Activity, Agent, Comment, Task, TaskRecord } from "../lib/types";

const SSE_EVENT_TYPES = [
  "activity",
  "agent_status",
  "comment_added",
  "task_created",
  "task_deleted",
  "task_updated",
] as const;

type TaskEventPayload = Task | TaskRecord;

export type SseEventType = (typeof SSE_EVENT_TYPES)[number];

export type SseEventMap = {
  activity: { activity: Activity };
  agent_status: { agents: Agent[] };
  comment_added: { comment: Comment; taskId: string };
  task_created: { task: TaskEventPayload };
  task_deleted: { taskId: string };
  task_updated: { task: TaskEventPayload };
};

export type SseEvent<EventType extends SseEventType = SseEventType> = {
  type: EventType;
} & SseEventMap[EventType];

export type SseStatus = "closed" | "connecting" | "open";

type SseListener<EventType extends SseEventType> = (
  event: SseEvent<EventType>,
) => void;

export type EventSourceLike = {
  addEventListener(
    type: string,
    listener: (event: Event | MessageEvent<string>) => void,
  ): void;
  close(): void;
  removeEventListener(
    type: string,
    listener: (event: Event | MessageEvent<string>) => void,
  ): void;
};

export type EventSourceFactory = (url: string) => EventSourceLike;

type SseConnectionOptions = {
  eventSourceFactory?: EventSourceFactory;
  reconnectDelayMs?: number;
  url?: string;
};

type SseListenerMap = {
  [EventType in SseEventType]: Set<SseListener<EventType>>;
};

function createListenerMap(): SseListenerMap {
  return {
    activity: new Set<SseListener<"activity">>(),
    agent_status: new Set<SseListener<"agent_status">>(),
    comment_added: new Set<SseListener<"comment_added">>(),
    task_created: new Set<SseListener<"task_created">>(),
    task_deleted: new Set<SseListener<"task_deleted">>(),
    task_updated: new Set<SseListener<"task_updated">>(),
  };
}

function defaultEventSourceFactory(url: string) {
  return new EventSource(url);
}

function parseEventPayload<EventType extends SseEventType>(
  type: EventType,
  rawEvent: Event | MessageEvent<string>,
) {
  if (!("data" in rawEvent) || typeof rawEvent.data !== "string") {
    return null;
  }

  try {
    return {
      type,
      ...(JSON.parse(rawEvent.data) as SseEventMap[EventType]),
    } satisfies SseEvent<EventType>;
  } catch {
    return null;
  }
}

export class SseConnection {
  private readonly eventSourceFactory: EventSourceFactory;
  private readonly listeners = createListenerMap();
  private readonly reconnectDelayMs: number;
  private readonly snapshotListeners = new Set<() => void>();
  private readonly url: string;

  private isStopped = true;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private source: EventSourceLike | null = null;
  private sourceListeners = new Map<
    string,
    (event: Event | MessageEvent<string>) => void
  >();
  private status: SseStatus = "closed";

  constructor({
    eventSourceFactory = defaultEventSourceFactory,
    reconnectDelayMs = 1_000,
    url = "/api/activities/stream",
  }: SseConnectionOptions = {}) {
    this.eventSourceFactory = eventSourceFactory;
    this.reconnectDelayMs = reconnectDelayMs;
    this.url = url;
  }

  subscribeStore = (listener: () => void) => {
    this.snapshotListeners.add(listener);

    return () => {
      this.snapshotListeners.delete(listener);
    };
  };

  getSnapshot = () => this.status;

  subscribe = <EventType extends SseEventType>(
    type: EventType,
    listener: SseListener<EventType>,
  ) => {
    const listeners = this.listeners[type] as Set<SseListener<EventType>>;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  connect = () => {
    if (!this.isStopped && this.source) {
      return;
    }

    this.isStopped = false;
    this.setStatus("connecting");
    this.open();
  };

  disconnect = () => {
    this.isStopped = true;
    this.clearReconnectTimeout();
    this.closeSource();
    this.setStatus("closed");
  };

  private emit<EventType extends SseEventType>(
    type: EventType,
    event: SseEvent<EventType>,
  ) {
    const listeners = this.listeners[type] as Set<SseListener<EventType>>;

    for (const listener of listeners) {
      listener(event);
    }
  }

  private notifySnapshotListeners() {
    for (const listener of this.snapshotListeners) {
      listener();
    }
  }

  private setStatus(status: SseStatus) {
    if (this.status === status) {
      return;
    }

    this.status = status;
    this.notifySnapshotListeners();
  }

  private clearReconnectTimeout() {
    if (this.reconnectTimeout === null) {
      return;
    }

    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = null;
  }

  private closeSource() {
    if (!this.source) {
      return;
    }

    const currentSource = this.source;

    for (const [type, listener] of this.sourceListeners) {
      currentSource.removeEventListener(type, listener);
    }

    currentSource.close();
    this.source = null;
    this.sourceListeners.clear();
  }

  private scheduleReconnect() {
    if (this.isStopped || this.reconnectTimeout !== null) {
      return;
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;

      if (this.isStopped) {
        return;
      }

      this.open();
    }, this.reconnectDelayMs);
  }

  private open() {
    if (this.isStopped || this.source) {
      return;
    }

    const source = this.eventSourceFactory(this.url);
    this.source = source;

    const openListener = () => {
      if (this.source !== source || this.isStopped) {
        return;
      }

      this.clearReconnectTimeout();
      this.setStatus("open");
    };

    const errorListener = () => {
      if (this.source !== source || this.isStopped) {
        return;
      }

      this.closeSource();
      this.setStatus("connecting");
      this.scheduleReconnect();
    };

    this.sourceListeners.set("open", openListener);
    this.sourceListeners.set("error", errorListener);
    source.addEventListener("open", openListener);
    source.addEventListener("error", errorListener);

    for (const type of SSE_EVENT_TYPES) {
      const listener = (rawEvent: Event | MessageEvent<string>) => {
        const event = parseEventPayload(type, rawEvent);

        if (!event) {
          return;
        }

        this.emit(type, event);
      };

      this.sourceListeners.set(type, listener);
      source.addEventListener(type, listener);
    }
  }
}

export function useSSE() {
  const connection = React.useMemo(() => new SseConnection(), []);
  const status = React.useSyncExternalStore(
    connection.subscribeStore,
    connection.getSnapshot,
    connection.getSnapshot,
  );

  React.useEffect(() => {
    connection.connect();

    return () => {
      connection.disconnect();
    };
  }, [connection]);

  return React.useMemo(
    () => ({
      connection,
      status,
      subscribe: connection.subscribe,
    }),
    [connection, status],
  );
}
