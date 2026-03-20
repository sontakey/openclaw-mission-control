import * as React from "react";

import type { FeedActivity } from "../components/live-feed/types";
import { apiGet } from "../lib/api";
import type { Activity } from "../lib/types";
import type { SseEvent } from "./useSSE";
import { useSSE } from "./useSSE";

type ActivitiesStatus = "error" | "idle" | "loading" | "ready";

type ActivitiesSnapshot = {
  activities: FeedActivity[] | undefined;
  error: Error | null;
  isLoading: boolean;
  status: ActivitiesStatus;
};

export type ActivitiesApi = {
  listActivities(limit: number): Promise<Activity[]>;
};

type ActivityEventSource = {
  subscribe(
    type: "activity",
    listener: (event: SseEvent<"activity">) => void,
  ): () => void;
};

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function getCreatedAt(createdAt: number) {
  return createdAt < 1_000_000_000_000 ? createdAt * 1000 : createdAt;
}

function getTaskTitle(message: string) {
  const match = message.match(/"([^"]+)"/);

  return match?.[1] ?? null;
}

function normalizeActivity(activity: Activity): FeedActivity {
  const taskTitle = getTaskTitle(activity.message);

  return {
    ...activity,
    _id: activity.id,
    agent: activity.agent_id
      ? {
          emoji: "🤖",
          name: activity.agent_id,
        }
      : null,
    createdAt: getCreatedAt(activity.created_at),
    task: taskTitle
      ? {
          title: taskTitle,
        }
      : null,
  };
}

function mergeActivities(
  currentActivities: FeedActivity[] | undefined,
  nextActivity: FeedActivity,
  limit: number,
) {
  const merged = [
    nextActivity,
    ...(currentActivities ?? []).filter((activity) => activity.id !== nextActivity.id),
  ];

  return merged.slice(0, limit);
}

export function createActivitiesApi(): ActivitiesApi {
  return {
    async listActivities(limit) {
      const response = await apiGet<{ activities: Activity[] }>(
        `/api/activities?limit=${limit}`,
      );

      return response?.activities ?? [];
    },
  };
}

export class ActivitiesStore {
  private readonly api: ActivitiesApi;
  private readonly limit: number;
  private readonly listeners = new Set<() => void>();
  private readonly sse: ActivityEventSource | null;

  private requestId = 0;
  private started = false;
  private state: ActivitiesSnapshot = {
    activities: undefined,
    error: null,
    isLoading: false,
    status: "idle",
  };
  private unsubscribe: () => void = () => undefined;

  constructor({
    api = createActivitiesApi(),
    limit = 50,
    sse = null,
  }: {
    api?: ActivitiesApi;
    limit?: number;
    sse?: ActivityEventSource | null;
  } = {}) {
    this.api = api;
    this.limit = limit;
    this.sse = sse;
  }

  subscribeStore = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  start = async () => {
    if (this.started) {
      return this.state.activities;
    }

    this.started = true;
    this.unsubscribe =
      this.sse?.subscribe("activity", (event) => {
        if (!this.started) {
          return;
        }

        this.setState({
          ...this.state,
          activities: mergeActivities(
            this.state.activities,
            normalizeActivity(event.activity),
            this.limit,
          ),
          error: null,
          isLoading: false,
          status: "ready",
        });
      }) ?? (() => undefined);

    return this.refetch();
  };

  stop = () => {
    this.started = false;
    this.requestId += 1;
    this.unsubscribe();
    this.unsubscribe = () => undefined;
  };

  refetch = () => this.load();

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private setState(state: ActivitiesSnapshot) {
    this.state = state;
    this.notify();
  }

  private async load() {
    const requestId = ++this.requestId;

    this.setState({
      ...this.state,
      error: null,
      isLoading: true,
      status: "loading",
    });

    try {
      const activities = (await this.api.listActivities(this.limit)).map(
        normalizeActivity,
      );

      if (!this.started || requestId !== this.requestId) {
        return activities;
      }

      this.setState({
        activities,
        error: null,
        isLoading: false,
        status: "ready",
      });

      return activities;
    } catch (error) {
      const nextError = toError(error);

      if (!this.started || requestId !== this.requestId) {
        throw nextError;
      }

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

export function useActivities(limit = 50) {
  const { connection } = useSSE();
  const store = React.useMemo(
    () => new ActivitiesStore({ limit, sse: connection }),
    [connection, limit],
  );
  const snapshot = React.useSyncExternalStore(
    store.subscribeStore,
    store.getSnapshot,
    store.getSnapshot,
  );

  React.useEffect(() => {
    void store.start();

    return () => {
      store.stop();
    };
  }, [store]);

  return snapshot.activities;
}

export { normalizeActivity };
export type { ActivitiesSnapshot, ActivitiesStatus };
