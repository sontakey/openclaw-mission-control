import assert from "node:assert/strict";
import test from "node:test";

import { ChatStore, buildOutgoingMessage } from "../src/hooks/use-chat.ts";

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

test("buildOutgoingMessage appends attachment summaries", () => {
  const message = buildOutgoingMessage("Status update", [
    {
      mimeType: "image/png",
      name: "diagram.png",
    },
  ]);

  assert.equal(message, "Status update\n\n[Attachment: diagram.png (image/png)]");
});

test("ChatStore loads history from the query-based history endpoint", async () => {
  const calls = mockFetch([
    new Response(
      JSON.stringify([
        {
          content: "Hello agent",
          createdAt: 1_710_000_000_000,
          id: "message-1",
          role: "user",
        },
      ]),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    ),
  ]);
  const store = new ChatStore({
    sessionKey: "agent:alpha:main",
  });

  await store.loadHistory();

  assert.equal(
    calls[0]?.input,
    "http://localhost:4173/api/chat/history?sessionKey=agent%3Aalpha%3Amain",
  );
  assert.equal(calls[0]?.init?.method, "GET");
  assert.deepEqual(store.getSnapshot().messages, [
    {
      content: "Hello agent",
      createdAt: 1_710_000_000_000,
      id: "message-1",
      role: "user",
    },
  ]);
});

test("ChatStore sends messages through /api/chat/send and appends the assistant reply", async () => {
  const calls = mockFetch([
    new Response(JSON.stringify({ response: "Acknowledged." }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
  ]);
  const store = new ChatStore({
    sessionKey: "agent:alpha:main",
  });

  store.setInput("Status update");
  await store.sendMessage("Status update");

  assert.equal(calls[0]?.input, "http://localhost:4173/api/chat/send");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    message: "Status update",
    sessionKey: "agent:alpha:main",
  });
  assert.equal(store.getSnapshot().input, "");
  assert.equal(store.getSnapshot().messages[0]?.role, "user");
  assert.equal(store.getSnapshot().messages[0]?.content, "Status update");
  assert.equal(store.getSnapshot().messages[1]?.role, "assistant");
  assert.equal(store.getSnapshot().messages[1]?.content, "Acknowledged.");
  assert.equal(store.getSnapshot().isStreaming, false);
});
