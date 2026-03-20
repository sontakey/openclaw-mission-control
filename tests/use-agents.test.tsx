import assert from "node:assert/strict";
import test from "node:test";

import { AgentsStore } from "../src/hooks/useAgents.ts";
import type { Agent } from "../src/lib/types.ts";

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

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    currentActivity: "Reviewing task queue",
    emoji: "🤖",
    id: "agent-1",
    lastHeartbeat: 1_710_000_000_000,
    name: "Alpha",
    role: "Operator",
    sessionKey: "agent:agent-1:main",
    status: "online",
    ...overrides,
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

test("AgentsStore fetches agents from /api/agents and polls for updates", async () => {
  const calls = mockFetch([
    new Response(JSON.stringify([createAgent()]), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
    new Response(
      JSON.stringify([
        createAgent({
          currentActivity: "Idle",
          status: "offline",
        }),
      ]),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    ),
  ]);
  const store = new AgentsStore({
    pollIntervalMs: 50,
  });

  await store.start();

  assert.equal(store.getSnapshot().status, "ready");
  assert.equal(store.getSnapshot().agents[0]?.status, "online");
  assert.equal(calls[0]?.input, "http://localhost:4173/api/agents");
  assert.equal(calls[0]?.init?.method, "GET");

  await new Promise((resolve) => setTimeout(resolve, 70));

  assert.equal(store.getSnapshot().agents[0]?.status, "offline");
  assert.ok(calls.length >= 2);

  store.stop();
});
