import * as React from "react";

import { apiGet } from "../lib/api";
import type { Agent } from "../lib/types";

type AgentsStatus = "error" | "idle" | "loading" | "ready";

type AgentsSnapshot = {
  agents: Agent[];
  error: Error | null;
  isLoading: boolean;
  status: AgentsStatus;
};

export type AgentsApi = {
  listAgents(): Promise<Agent[]>;
};

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export function createAgentsApi(): AgentsApi {
  return {
    async listAgents() {
      return (await apiGet<Agent[]>("/api/agents")) ?? [];
    },
  };
}

export class AgentsStore {
  private readonly api: AgentsApi;
  private readonly listeners = new Set<() => void>();
  private readonly pollIntervalMs: number;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private requestId = 0;
  private started = false;
  private state: AgentsSnapshot = {
    agents: [],
    error: null,
    isLoading: false,
    status: "idle",
  };

  constructor({
    api = createAgentsApi(),
    pollIntervalMs = 30_000,
  }: {
    api?: AgentsApi;
    pollIntervalMs?: number;
  } = {}) {
    this.api = api;
    this.pollIntervalMs = pollIntervalMs;
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
      return this.state.agents;
    }

    this.started = true;
    this.intervalId = setInterval(() => {
      void this.load({ background: true });
    }, this.pollIntervalMs);

    return this.refetch();
  };

  stop = () => {
    this.started = false;
    this.requestId += 1;

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  };

  refetch = () => this.load();

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private setState(state: AgentsSnapshot) {
    this.state = state;
    this.notify();
  }

  private async load({ background = false }: { background?: boolean } = {}) {
    const requestId = ++this.requestId;

    if (!background) {
      this.setState({
        ...this.state,
        error: null,
        isLoading: true,
        status: "loading",
      });
    }

    try {
      const agents = await this.api.listAgents();

      if (!this.started || requestId !== this.requestId) {
        return agents;
      }

      this.setState({
        agents,
        error: null,
        isLoading: false,
        status: "ready",
      });

      return agents;
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

export function useAgents() {
  const store = React.useMemo(() => new AgentsStore(), []);
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

  return React.useMemo(
    () => ({
      ...snapshot,
      refetch: store.refetch,
    }),
    [snapshot, store],
  );
}

export type { AgentsSnapshot, AgentsStatus };
