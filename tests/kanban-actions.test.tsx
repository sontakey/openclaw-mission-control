import assert from "node:assert/strict";
import test from "node:test";

import {
  createKanbanTask,
  approveKanbanTask,
  requestKanbanTaskChanges,
} from "../src/components/kanban/task-actions.ts";

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

test("createKanbanTask posts a trimmed task payload", async () => {
  const calls = mockFetch([
    new Response(JSON.stringify({ task: { id: "task-1" } }), {
      headers: { "Content-Type": "application/json" },
      status: 201,
    }),
  ]);

  await createKanbanTask({
    description: "  Add the release notes.  ",
    priority: "urgent",
    title: "  Ship docs  ",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "http://localhost:4173/api/tasks");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(
    calls[0]?.init?.body,
    JSON.stringify({
      description: "Add the release notes.",
      priority: "urgent",
      title: "Ship docs",
    }),
  );
});

test("approveKanbanTask patches the task to done", async () => {
  const calls = mockFetch([
    new Response(JSON.stringify({ task: { id: "task-1", status: "done" } }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
  ]);

  await approveKanbanTask("task-1");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "http://localhost:4173/api/tasks/task-1");
  assert.equal(calls[0]?.init?.method, "PATCH");
  assert.equal(calls[0]?.init?.body, JSON.stringify({ status: "done" }));
});

test("requestKanbanTaskChanges posts feedback and moves the task back to assigned", async () => {
  const calls = mockFetch([
    new Response(JSON.stringify({ comment: { id: "comment-1" } }), {
      headers: { "Content-Type": "application/json" },
      status: 201,
    }),
    new Response(
      JSON.stringify({ task: { id: "task-1", status: "assigned" } }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    ),
  ]);

  await requestKanbanTaskChanges("task-1", "  Please tighten the copy.  ");

  assert.deepEqual(
    calls.map((call) => [call.init?.method, call.input, call.init?.body]),
    [
      [
        "POST",
        "http://localhost:4173/api/tasks/task-1/comments",
        JSON.stringify({
          author: "operator",
          content: "Please tighten the copy.",
        }),
      ],
      [
        "PATCH",
        "http://localhost:4173/api/tasks/task-1",
        JSON.stringify({ status: "assigned" }),
      ],
    ],
  );
});
