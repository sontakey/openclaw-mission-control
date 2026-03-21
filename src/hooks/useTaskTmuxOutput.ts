import * as React from "react";

import { apiGet } from "../lib/api";

export type TaskTmuxOutput = {
  capturedAt: number;
  output: string;
  session: string;
};

type TaskTmuxOutputState = {
  data: TaskTmuxOutput | null;
  error: Error | null;
  isLoading: boolean;
};

export type TaskTmuxOutputApi = {
  getTaskTmuxOutput(taskId: string): Promise<TaskTmuxOutput>;
};

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export function createTaskTmuxOutputApi(): TaskTmuxOutputApi {
  return {
    async getTaskTmuxOutput(taskId) {
      const response = await apiGet<TaskTmuxOutput>(
        `/api/tasks/${encodeURIComponent(taskId)}/tmux-output`,
      );

      if (!response) {
        throw new Error("Missing tmux output response.");
      }

      return response;
    },
  };
}

export function useTaskTmuxOutput({
  api,
  enabled,
  pollIntervalMs = 3000,
  taskId,
}: {
  api?: TaskTmuxOutputApi;
  enabled: boolean;
  pollIntervalMs?: number;
  taskId: string;
}) {
  const resolvedApi = React.useMemo(
    () => api ?? createTaskTmuxOutputApi(),
    [api],
  );
  const [state, setState] = React.useState<TaskTmuxOutputState>({
    data: null,
    error: null,
    isLoading: enabled,
  });

  React.useEffect(() => {
    if (!enabled) {
      setState({
        data: null,
        error: null,
        isLoading: false,
      });
      return;
    }

    let isActive = true;

    const load = async (isInitialLoad: boolean) => {
      if (!isActive) {
        return;
      }

      setState((current) => ({
        data: current.data,
        error: null,
        isLoading: isInitialLoad && current.data === null,
      }));

      try {
        const data = await resolvedApi.getTaskTmuxOutput(taskId);

        if (!isActive) {
          return;
        }

        setState({
          data,
          error: null,
          isLoading: false,
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setState((current) => ({
          data: current.data,
          error: toError(error),
          isLoading: false,
        }));
      }
    };

    void load(true);
    const intervalId = setInterval(() => {
      void load(false);
    }, pollIntervalMs);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [enabled, pollIntervalMs, resolvedApi, taskId]);

  return state;
}
