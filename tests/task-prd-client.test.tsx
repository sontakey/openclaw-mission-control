import assert from "node:assert/strict";
import test from "node:test";

import { createTaskPrdApi } from "../src/hooks/useTaskPrd.ts";

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

test("task PRD API fetches the task PRD endpoint", async () => {
  const calls = mockFetch([
    new Response(
      JSON.stringify({
        content: "# Mission\n\n- Ship the PRD tab",
        exists: true,
        path: "/home/ubuntu/Projects/mission-control/PRD.md",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    ),
  ]);
  const api = createTaskPrdApi();

  const prd = await api.getTaskPrd("task-1");

  assert.deepEqual(prd, {
    content: "# Mission\n\n- Ship the PRD tab",
    exists: true,
    path: "/home/ubuntu/Projects/mission-control/PRD.md",
  });
  assert.deepEqual(calls, [
    {
      init: {
        headers: new Headers({
          Accept: "application/json",
        }),
        method: "GET",
      },
      input: "http://localhost:4173/api/tasks/task-1/prd",
    },
  ]);
});
