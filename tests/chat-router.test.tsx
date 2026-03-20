import assert from "node:assert/strict";
import test from "node:test";

import { createChatRouter } from "../server/routes/chat.js";

type MockResponse = {
  body: unknown;
  json(payload: unknown): MockResponse;
  status(code: number): MockResponse;
  statusCode: number;
};

function createMockResponse() {
  const response: MockResponse = {
    body: null,
    json(payload) {
      response.body = payload;
      return response;
    },
    status(code) {
      response.statusCode = code;
      return response;
    },
    statusCode: 200,
  };

  return response;
}

function getRouteHandler(router: ReturnType<typeof createChatRouter>, method: "get" | "post", path: string) {
  const layer = (
    router as unknown as {
      stack: Array<{
        route?: {
          methods: Partial<Record<"get" | "post", boolean>>;
          path: string;
          stack: Array<{ handle: (request: unknown, response: MockResponse) => unknown }>;
        };
      }>;
    }
  ).stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);

  assert.ok(layer?.route, `Expected ${method.toUpperCase()} ${path} route to exist.`);
  return layer.route.stack[0]?.handle;
}

async function invokeRoute(
  router: ReturnType<typeof createChatRouter>,
  {
    body,
    method,
    params,
    path,
  }: {
    body?: unknown;
    method: "get" | "post";
    params?: Record<string, string>;
    path: string;
  },
) {
  const handler = getRouteHandler(router, method, path);
  const response = createMockResponse();

  await handler(
    {
      body,
      params: params ?? {},
    },
    response,
  );

  return response;
}

test("chat router validates send requests before calling the gateway", async () => {
  let sendCalls = 0;
  const router = createChatRouter({
    sendToSession: async () => {
      sendCalls += 1;
      return { ok: true };
    },
  });

  const missingSessionResponse = await invokeRoute(router, {
    body: { message: "Hello" },
    method: "post",
    path: "/send",
  });
  const missingMessageResponse = await invokeRoute(router, {
    body: { message: "   ", sessionKey: "agent:alpha:main" },
    method: "post",
    path: "/send",
  });

  assert.equal(missingSessionResponse.statusCode, 400);
  assert.deepEqual(missingSessionResponse.body, {
    error: "sessionKey is required.",
  });
  assert.equal(missingMessageResponse.statusCode, 400);
  assert.deepEqual(missingMessageResponse.body, {
    error: "message is required.",
  });
  assert.equal(sendCalls, 0);
});

test("chat router proxies sends to the gateway and unwraps the response", async () => {
  const calls: Array<{ message: string; sessionKey: string }> = [];
  const router = createChatRouter({
    sendToSession: async (sessionKey, message) => {
      calls.push({ message, sessionKey });

      return {
        ok: true,
        result: {
          content: [
            {
              text: JSON.stringify({
                response: "Acknowledged.",
              }),
            },
          ],
        },
      };
    },
  });

  const response = await invokeRoute(router, {
    body: {
      message: "Status update",
      sessionKey: "agent:alpha:main",
    },
    method: "post",
    path: "/send",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    response: "Acknowledged.",
  });
  assert.deepEqual(calls, [
    {
      message: "Status update",
      sessionKey: "agent:alpha:main",
    },
  ]);
});

test("chat router returns a cleaned message history array", async () => {
  const router = createChatRouter({
    getSessionHistory: async (sessionKey) => {
      assert.equal(sessionKey, "agent:alpha:main");

      return {
        ok: true,
        result: {
          content: [
            {
              text: JSON.stringify({
                messages: [
                  {
                    content: "  Hello agent  ",
                    createdAt: "2026-03-20T12:00:00.000Z",
                    id: "msg-1",
                    role: "user",
                  },
                  {
                    content: [{ text: "Hi there.", type: "text" }],
                    messageId: "msg-2",
                    sender: "assistant",
                    timestamp: 1_710_936_123,
                  },
                  {
                    content: "Invocation trace",
                    created_at: 1_710_936_124,
                    id: "msg-3",
                    role: "tool",
                  },
                  {
                    content: "   ",
                    id: "msg-4",
                    role: "assistant",
                  },
                  {
                    content: "Ignored",
                    id: "msg-5",
                    role: "unknown",
                  },
                ],
              }),
            },
          ],
        },
      };
    },
  });

  const response = await invokeRoute(router, {
    method: "get",
    params: {
      sessionKey: "agent:alpha:main",
    },
    path: "/history/:sessionKey",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, [
    {
      content: "Hello agent",
      createdAt: Date.parse("2026-03-20T12:00:00.000Z"),
      id: "msg-1",
      role: "user",
    },
    {
      content: "Hi there.",
      createdAt: 1_710_936_123_000,
      id: "msg-2",
      role: "assistant",
    },
    {
      content: "Invocation trace",
      createdAt: 1_710_936_124_000,
      id: "msg-3",
      role: "system",
    },
  ]);
});
