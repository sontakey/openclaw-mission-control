import assert from "node:assert/strict";
import test from "node:test";

import {
  TasksStore,
  createTasksApi,
  fetchTasks,
  groupTasksByParent,
  type TasksApi,
} from "../src/hooks/useTasks.ts";
import type { Task, TaskRecord } from "../src/lib/types.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

type FetchCall = {
  init: Parameters<typeof fetch>[1];
  input: Parameters<typeof fetch>[0];
};

function setWindowOrigin(origin: string) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        origin,
      },
    },
  });
}

function mockFetch(responses: Response[]) {
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input, init) => {
    calls.push({ init, input });

    const response = responses.shift();

    if (!response) {
      throw new Error("No mock response available.");
    }

    return response;
  }) as typeof fetch;

  return calls;
}

function createTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    assignee_agent_id: null,
    completed_at: null,
    created_at: 1,
    created_by: "operator",
    description: "Investigate issue",
    id: "task-1",
    metadata: null,
    parent_task_id: null,
    priority: "normal",
    status: "inbox",
    title: "Fix bug",
    updated_at: 1,
    ...overrides,
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    ...createTaskRecord(),
    children: [],
    comments: [],
    parent: null,
    parent_task_id: null,
    subtasks: [],
    ...overrides,
  };
}

function createMockTaskEventSource() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();

  return {
    emit(type: string, event: unknown) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
    subscribe(type: string, listener: (event: unknown) => void) {
      const eventListeners = listeners.get(type) ?? new Set();
      eventListeners.add(listener);
      listeners.set(type, eventListeners);

      return () => {
        eventListeners.delete(listener);
      };
    },
  };
}

test.beforeEach(() => {
  setWindowOrigin("http://localhost:4173");
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("tasks API helpers call the expected endpoints and fetch task details", async () => {
  const taskRecord = createTaskRecord();
  const task = createTask();
  const calls = mockFetch([
    new Response(JSON.stringify({ tasks: [taskRecord] }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
    new Response(JSON.stringify({ task }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
    new Response(JSON.stringify({ task: createTaskRecord({ id: "task-2" }) }), {
      headers: { "Content-Type": "application/json" },
      status: 201,
    }),
    new Response(JSON.stringify({ task: createTaskRecord({ status: "review" }) }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
    new Response(
      JSON.stringify({
        comment: {
          author: "agent-1",
          content: "Looking now.",
          created_at: 2,
          id: "comment-1",
          task_id: "task-1",
          type: "comment",
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 201,
      },
    ),
    new Response(
      JSON.stringify({
        subtask: {
          assignee_agent_id: null,
          blocked_reason: null,
          done: false,
          done_at: null,
          id: "subtask-1",
          sort_order: 0,
          status: "pending",
          task_id: "task-1",
          title: "Reproduce bug",
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 201,
      },
    ),
    new Response(
      JSON.stringify({
        subtask: {
          assignee_agent_id: null,
          blocked_reason: null,
          done: true,
          done_at: 3,
          id: "subtask-1",
          sort_order: 0,
          status: "done",
          task_id: "task-1",
          title: "Reproduce bug",
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    ),
    new Response(null, { status: 204 }),
  ]);
  const api = createTasksApi();

  const tasks = await fetchTasks(api);
  const createdTask = await api.createTask({
    parent_task_id: "plan-1",
    title: "Write docs",
  });
  const updatedTask = await api.updateTask("task-1", { status: "review" });
  const comment = await api.addComment("task-1", {
    author: "agent-1",
    content: "Looking now.",
  });
  const subtask = await api.addSubtask("task-1", {
    title: "Reproduce bug",
  });
  const updatedSubtask = await api.updateSubtask("task-1", "subtask-1", {
    status: "done",
  });
  await api.deleteTask("task-1");

  assert.deepEqual(tasks, [task]);
  assert.equal(createdTask.id, "task-2");
  assert.equal(updatedTask.status, "review");
  assert.equal(comment.id, "comment-1");
  assert.equal(subtask.id, "subtask-1");
  assert.equal(updatedSubtask.status, "done");
  assert.deepEqual(
    calls.map((call) => [call.init?.method, call.input]),
    [
      ["GET", "http://localhost:4173/api/tasks"],
      ["GET", "http://localhost:4173/api/tasks/task-1"],
      ["POST", "http://localhost:4173/api/tasks"],
      ["PATCH", "http://localhost:4173/api/tasks/task-1"],
      ["POST", "http://localhost:4173/api/tasks/task-1/comments"],
      ["POST", "http://localhost:4173/api/tasks/task-1/subtasks"],
      ["PATCH", "http://localhost:4173/api/tasks/task-1/subtasks/subtask-1"],
      ["DELETE", "http://localhost:4173/api/tasks/task-1"],
    ],
  );
  assert.equal(
    calls[2]?.init?.body,
    JSON.stringify({
      parent_task_id: "plan-1",
      title: "Write docs",
    }),
  );
});

test("groupTasksByParent collapses child tasks under their parent for board rendering", () => {
  const childTask = createTask({
    comments: [
      {
        author: "agent-1",
        content: "Working on it.",
        created_at: 2,
        id: "comment-1",
        task_id: "child-1",
        type: "comment",
      },
    ],
    id: "child-1",
    parent: createTaskRecord({
      child_count: 1,
      id: "plan-1",
      title: "Launch plan",
    }),
    parent_task_id: "plan-1",
    title: "Ship API",
  });
  const parentTask = createTask({
    child_count: 1,
    children: [
      createTaskRecord({
        id: "child-1",
        parent_task_id: "plan-1",
        title: "Ship API",
      }),
    ],
    id: "plan-1",
    title: "Launch plan",
  });
  const standaloneTask = createTask({
    id: "task-standalone",
    title: "Review copy",
  });

  const boardTasks = groupTasksByParent([childTask, parentTask, standaloneTask]);

  assert.deepEqual(
    boardTasks.map((task) => task.id),
    ["plan-1", "task-standalone"],
  );
  assert.equal(boardTasks[0]?.children?.[0]?.id, "child-1");
  assert.equal((boardTasks[0]?.children?.[0] as Task | undefined)?.comments[0]?.id, "comment-1");
});

test("TasksStore toggles subtasks and refetches when task SSE events arrive", async () => {
  const initialTask = createTask({
    subtasks: [
      {
        assignee_agent_id: null,
        blocked_reason: null,
        done: false,
        done_at: null,
        id: "subtask-1",
        sort_order: 0,
        status: "pending",
        task_id: "task-1",
        title: "Reproduce bug",
      },
    ],
  });
  const completedTask = createTask({
    status: "review",
    subtasks: [
      {
        ...initialTask.subtasks[0],
        done: true,
        done_at: 4,
        status: "done",
      },
    ],
  });
  const taskEvents = createMockTaskEventSource();
  const updateSubtaskCalls: Array<{
    input: { status?: string };
    subtaskId: string;
    taskId: string;
  }> = [];
  let currentTask = initialTask;
  let listCalls = 0;
  const api: TasksApi = {
    async addComment() {
      throw new Error("Not implemented in this test.");
    },
    async addSubtask() {
      throw new Error("Not implemented in this test.");
    },
    async createTask() {
      throw new Error("Not implemented in this test.");
    },
    async deleteTask() {
      throw new Error("Not implemented in this test.");
    },
    async getTask() {
      return currentTask;
    },
    async listTaskRecords() {
      listCalls += 1;
      return [createTaskRecord()];
    },
    async updateSubtask(taskId, subtaskId, input) {
      updateSubtaskCalls.push({ input, subtaskId, taskId });
      currentTask = completedTask;

      return completedTask.subtasks[0]!;
    },
    async updateTask() {
      throw new Error("Not implemented in this test.");
    },
  };
  const store = new TasksStore({
    api,
    sse: taskEvents,
  });

  await store.start();
  assert.equal(store.getSnapshot().tasks[0]?.subtasks[0]?.done, false);
  assert.equal(store.getSnapshot().boardTasks[0]?.id, "task-1");
  assert.equal(store.getSnapshot().status, "ready");

  const updatedSubtask = await store.toggleSubtask("task-1", "subtask-1");

  assert.equal(updatedSubtask.status, "done");
  assert.deepEqual(updateSubtaskCalls, [
    {
      input: { status: "done" },
      subtaskId: "subtask-1",
      taskId: "task-1",
    },
  ]);
  assert.equal(store.getSnapshot().tasks[0]?.subtasks[0]?.done, true);

  currentTask = createTask({
    status: "done",
    subtasks: completedTask.subtasks,
  });
  taskEvents.emit("task_updated", {
    task: { id: "task-1" },
    type: "task_updated",
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(store.getSnapshot().tasks[0]?.status, "done");
  assert.ok(listCalls >= 3);

  store.stop();
});
