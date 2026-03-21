import * as React from "react";

import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import type {
  Comment,
  Subtask,
  SubtaskStatus,
  Task,
  TaskPriority,
  TaskRecord,
  TaskStatus,
} from "../lib/types";
import type { SseEvent, SseEventType } from "./useSSE";
import { useSSE } from "./useSSE";

const TASK_REFRESH_EVENTS = [
  "comment_added",
  "task_created",
  "task_deleted",
  "task_updated",
] as const;

type TaskRefreshEventType = (typeof TASK_REFRESH_EVENTS)[number];

type TasksStatus = "error" | "idle" | "loading" | "ready";

type CreateTaskInput = {
  assignee_agent_id?: string | null;
  created_by?: string | null;
  description?: string | null;
  metadata?: unknown | null;
  parent_task_id?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  title: string;
};

type UpdateTaskInput = {
  assignee_agent_id?: string | null;
  created_by?: string | null;
  description?: string | null;
  metadata?: unknown | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  title?: string;
};

type AddCommentInput = {
  author: string;
  content: string;
  type?: Comment["type"];
};

type AddSubtaskInput = {
  assignee_agent_id?: string | null;
  blocked_reason?: string | null;
  done?: boolean;
  sort_order?: number;
  status?: SubtaskStatus;
  title: string;
};

type UpdateSubtaskInput = {
  assignee_agent_id?: string | null;
  blocked_reason?: string | null;
  done?: boolean;
  sort_order?: number;
  status?: SubtaskStatus;
  title?: string;
};

type TaskEventSource = {
  subscribe<EventType extends TaskRefreshEventType>(
    type: EventType,
    listener: (event: SseEvent<EventType>) => void,
  ): () => void;
};

type TasksSnapshot = {
  boardTasks: Task[];
  error: Error | null;
  isLoading: boolean;
  status: TasksStatus;
  tasks: Task[];
};

export type TasksApi = {
  addComment(taskId: string, input: AddCommentInput): Promise<Comment>;
  addSubtask(taskId: string, input: AddSubtaskInput): Promise<Subtask>;
  createTask(input: CreateTaskInput): Promise<TaskRecord>;
  deleteTask(taskId: string): Promise<void>;
  getTask(taskId: string): Promise<Task>;
  listTaskRecords(): Promise<TaskRecord[]>;
  updateSubtask(
    taskId: string,
    subtaskId: string,
    input: UpdateSubtaskInput,
  ): Promise<Subtask>;
  updateTask(taskId: string, input: UpdateTaskInput): Promise<TaskRecord>;
};

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export function createTasksApi(): TasksApi {
  return {
    async addComment(taskId, input) {
      const response = await apiPost<{ comment: Comment }>(
        `/api/tasks/${taskId}/comments`,
        input,
      );

      if (!response) {
        throw new Error("Missing comment response.");
      }

      return response.comment;
    },
    async addSubtask(taskId, input) {
      const response = await apiPost<{ subtask: Subtask }>(
        `/api/tasks/${taskId}/subtasks`,
        input,
      );

      if (!response) {
        throw new Error("Missing subtask response.");
      }

      return response.subtask;
    },
    async createTask(input) {
      const response = await apiPost<{ task: TaskRecord }>("/api/tasks", input);

      if (!response) {
        throw new Error("Missing task response.");
      }

      return response.task;
    },
    async deleteTask(taskId) {
      await apiDelete(`/api/tasks/${taskId}`);
    },
    async getTask(taskId) {
      const response = await apiGet<{ task: Task }>(`/api/tasks/${taskId}`);

      if (!response) {
        throw new Error("Missing task response.");
      }

      return response.task;
    },
    async listTaskRecords() {
      const response = await apiGet<{ tasks: TaskRecord[] }>("/api/tasks");

      if (!response) {
        return [];
      }

      return response.tasks;
    },
    async updateSubtask(taskId, subtaskId, input) {
      const response = await apiPatch<{ subtask: Subtask }>(
        `/api/tasks/${taskId}/subtasks/${subtaskId}`,
        input,
      );

      if (!response) {
        throw new Error("Missing subtask response.");
      }

      return response.subtask;
    },
    async updateTask(taskId, input) {
      const response = await apiPatch<{ task: TaskRecord }>(
        `/api/tasks/${taskId}`,
        input,
      );

      if (!response) {
        throw new Error("Missing task response.");
      }

      return response.task;
    },
  };
}

export async function fetchTasks(api: TasksApi = createTasksApi()) {
  const taskRecords = await api.listTaskRecords();

  if (taskRecords.length === 0) {
    return [] satisfies Task[];
  }

  return Promise.all(taskRecords.map((task) => api.getTask(task.id)));
}

export function groupTasksByParent(tasks: Task[]) {
  const tasksById = new Map(tasks.map((task) => [task.id, task] as const));

  return tasks.flatMap((task) => {
    if (task.parent_task_id && tasksById.has(task.parent_task_id)) {
      return [];
    }

    const childTasks =
      task.children?.flatMap((child) => {
        const detailedChild = tasksById.get(child.id);
        return detailedChild ? [detailedChild] : [];
      }) ??
      tasks.filter((candidate) => candidate.parent_task_id === task.id);

    if (childTasks.length === 0) {
      return [task];
    }

    return [
      {
        ...task,
        children: childTasks,
      },
    ];
  });
}

export class TasksStore {
  private readonly api: TasksApi;
  private readonly listeners = new Set<() => void>();
  private readonly sse: TaskEventSource | null;

  private requestId = 0;
  private started = false;
  private state: TasksSnapshot = {
    boardTasks: [],
    error: null,
    isLoading: false,
    status: "idle",
    tasks: [],
  };
  private unsubscribers: Array<() => void> = [];

  constructor({
    api = createTasksApi(),
    sse = null,
  }: {
    api?: TasksApi;
    sse?: TaskEventSource | null;
  } = {}) {
    this.api = api;
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
      return this.state.tasks;
    }

    this.started = true;
    this.unsubscribers = TASK_REFRESH_EVENTS.map((eventType) =>
      this.sse?.subscribe(eventType, () => {
        void this.load({ background: true });
      }) ?? (() => undefined),
    );

    return this.refetch();
  };

  stop = () => {
    this.started = false;
    this.requestId += 1;

    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }

    this.unsubscribers = [];
  };

  refetch = () => this.load();

  createTask = async (input: CreateTaskInput) => {
    const task = await this.api.createTask(input);
    const tasks = await this.refetch();

    return tasks.find((candidate) => candidate.id === task.id);
  };

  updateTask = async (taskId: string, input: UpdateTaskInput) => {
    const task = await this.api.updateTask(taskId, input);
    const tasks = await this.refetch();

    return tasks.find((candidate) => candidate.id === task.id);
  };

  deleteTask = async (taskId: string) => {
    await this.api.deleteTask(taskId);
    await this.refetch();
  };

  addComment = async (taskId: string, input: AddCommentInput) => {
    const comment = await this.api.addComment(taskId, input);
    await this.refetch();
    return comment;
  };

  addSubtask = async (taskId: string, input: AddSubtaskInput) => {
    const subtask = await this.api.addSubtask(taskId, input);
    await this.refetch();
    return subtask;
  };

  toggleSubtask = async (taskId: string, subtaskId: string) => {
    const task = this.state.tasks.find((candidate) => candidate.id === taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found.`);
    }

    const subtask = task.subtasks.find((candidate) => candidate.id === subtaskId);

    if (!subtask) {
      throw new Error(`Subtask ${subtaskId} not found.`);
    }

    const nextStatus = subtask.done ? "pending" : "done";
    const updatedSubtask = await this.api.updateSubtask(taskId, subtaskId, {
      status: nextStatus,
    });

    await this.refetch();
    return updatedSubtask;
  };

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private setState(state: TasksSnapshot) {
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
      const tasks = await fetchTasks(this.api);

      if (!this.started || requestId !== this.requestId) {
        return tasks;
      }

      this.setState({
        boardTasks: groupTasksByParent(tasks),
        error: null,
        isLoading: false,
        status: "ready",
        tasks,
      });

      return tasks;
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

export function useTasks() {
  const { connection } = useSSE();
  const store = React.useMemo(
    () => new TasksStore({ sse: connection }),
    [connection],
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

  return React.useMemo(
    () => ({
      ...snapshot,
      addComment: store.addComment,
      addSubtask: store.addSubtask,
      createTask: store.createTask,
      deleteTask: store.deleteTask,
      refetch: store.refetch,
      toggleSubtask: store.toggleSubtask,
      updateTask: store.updateTask,
    }),
    [snapshot, store],
  );
}

export type {
  AddCommentInput,
  AddSubtaskInput,
  CreateTaskInput,
  TasksSnapshot,
  TasksStatus,
  UpdateSubtaskInput,
  UpdateTaskInput,
};
export type { SseEventType };
