import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../src/lib/api.ts";
import "../src/lib/types.ts";

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

test("apiGet resolves paths against window.location.origin and parses json responses", async () => {
  const calls = mockFetch([
    new Response(JSON.stringify({ tasks: [{ id: "task-1" }] }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
    }),
  ]);

  const response = await apiGet<{ tasks: Array<{ id: string }> }>("/api/tasks");

  assert.deepEqual(response, { tasks: [{ id: "task-1" }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "http://localhost:4173/api/tasks");
  assert.deepEqual(calls[0]?.init, {
    headers: new Headers({
      Accept: "application/json",
    }),
    method: "GET",
  });
});

test("apiPost and apiPatch send JSON request bodies", async () => {
  const calls = mockFetch([
    new Response(JSON.stringify({ task: { id: "task-1" } }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 201,
    }),
    new Response(JSON.stringify({ task: { id: "task-1", status: "review" } }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
    }),
  ]);

  const createdTask = await apiPost<{ task: { id: string } }>("/api/tasks", {
    title: "Ship types",
  });
  const updatedTask = await apiPatch<{ task: { id: string; status: string } }>(
    "/api/tasks/task-1",
    {
      status: "review",
    },
  );

  assert.deepEqual(createdTask, { task: { id: "task-1" } });
  assert.deepEqual(updatedTask, { task: { id: "task-1", status: "review" } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.input, "http://localhost:4173/api/tasks");
  assert.equal(calls[1]?.input, "http://localhost:4173/api/tasks/task-1");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.equal(
    (calls[0]?.init?.headers instanceof Headers &&
      calls[0].init.headers.get("Content-Type")) ||
      null,
    "application/json",
  );
  assert.equal(
    (calls[1]?.init?.headers instanceof Headers &&
      calls[1].init.headers.get("Content-Type")) ||
      null,
    "application/json",
  );
  assert.equal(calls[0]?.init?.body, JSON.stringify({ title: "Ship types" }));
  assert.equal(calls[1]?.init?.body, JSON.stringify({ status: "review" }));
});

test("apiDelete returns null for empty responses", async () => {
  const calls = mockFetch([
    new Response(null, {
      status: 204,
    }),
  ]);

  const response = await apiDelete("/api/tasks/task-1");

  assert.equal(response, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "http://localhost:4173/api/tasks/task-1");
  assert.equal(calls[0]?.init?.method, "DELETE");
});

test("api helpers throw ApiError with the server error payload", async () => {
  mockFetch([
    new Response(JSON.stringify({ error: "Invalid status." }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 400,
    }),
  ]);

  await assert.rejects(
    () => apiPatch("/api/tasks/task-1", { status: "bad" }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "Invalid status.");
      assert.deepEqual(error.body, { error: "Invalid status." });
      return true;
    },
  );
});
