import * as React from "react";

import { apiGet } from "../lib/api";

export type TaskPrd = {
  content: string | null;
  exists: boolean;
  path: string | null;
};

type TaskPrdState = {
  data: TaskPrd | null;
  error: Error | null;
  isLoading: boolean;
};

export type TaskPrdApi = {
  getTaskPrd(taskId: string): Promise<TaskPrd>;
};

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export function createTaskPrdApi(): TaskPrdApi {
  return {
    async getTaskPrd(taskId) {
      const response = await apiGet<TaskPrd>(
        `/api/tasks/${encodeURIComponent(taskId)}/prd`,
      );

      if (!response) {
        throw new Error("Missing PRD response.");
      }

      return response;
    },
  };
}

export function useTaskPrd({
  api,
  enabled,
  open,
  taskId,
}: {
  api?: TaskPrdApi;
  enabled: boolean;
  open: boolean;
  taskId: string;
}) {
  const resolvedApi = React.useMemo(() => api ?? createTaskPrdApi(), [api]);
  const loadedTaskIdRef = React.useRef<string | null>(null);
  const [state, setState] = React.useState<TaskPrdState>({
    data: null,
    error: null,
    isLoading: false,
  });

  React.useEffect(() => {
    if (!open || taskId.length === 0) {
      loadedTaskIdRef.current = null;
      setState({
        data: null,
        error: null,
        isLoading: false,
      });
      return;
    }

    if (loadedTaskIdRef.current !== taskId) {
      loadedTaskIdRef.current = null;
      setState({
        data: null,
        error: null,
        isLoading: false,
      });
    }
  }, [open, taskId]);

  React.useEffect(() => {
    if (
      !open ||
      !enabled ||
      taskId.length === 0 ||
      loadedTaskIdRef.current === taskId
    ) {
      return;
    }

    let isActive = true;

    setState((current) => ({
      data: current.data,
      error: null,
      isLoading: current.data === null,
    }));

    void resolvedApi
      .getTaskPrd(taskId)
      .then((data) => {
        if (!isActive) {
          return;
        }

        loadedTaskIdRef.current = taskId;
        setState({
          data,
          error: null,
          isLoading: false,
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setState((current) => ({
          data: current.data,
          error: toError(error),
          isLoading: false,
        }));
      });

    return () => {
      isActive = false;
    };
  }, [enabled, open, resolvedApi, taskId]);

  return state;
}
