import assert from "node:assert/strict";
import test from "node:test";

const originalGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
const originalGatewayToken = process.env.OPENCLAW_TOKEN;
const originalFetch = globalThis.fetch;

delete process.env.OPENCLAW_GATEWAY_URL;
process.env.OPENCLAW_TOKEN = "test-token";

const gatewayClient = await import("../server/gateway-client.ts");

type FetchCall = {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
};

function mockFetch(responses: unknown[]) {
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input, init) => {
    calls.push({ input, init });

    return {
      json: async () => responses.shift(),
    } as Response;
  }) as typeof fetch;

  return calls;
}

function parseCallBody(call: FetchCall) {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

test.after(() => {
  globalThis.fetch = originalFetch;

  if (originalGatewayUrl === undefined) {
    delete process.env.OPENCLAW_GATEWAY_URL;
  } else {
    process.env.OPENCLAW_GATEWAY_URL = originalGatewayUrl;
  }

  if (originalGatewayToken === undefined) {
    delete process.env.OPENCLAW_TOKEN;
  } else {
    process.env.OPENCLAW_TOKEN = originalGatewayToken;
  }
});

test("invokeTool posts to the default gateway URL with bearer auth", async () => {
  const response = { ok: true, result: { content: [] } };
  const calls = mockFetch([response]);

  const result = await gatewayClient.invokeTool("sessions_list", { activeMinutes: 5 });

  assert.deepEqual(result, response);
  assert.equal(gatewayClient.GATEWAY_URL, "http://127.0.0.1:18789");
  assert.equal(gatewayClient.GATEWAY_TOKEN, "test-token");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "http://127.0.0.1:18789/tools/invoke");
  assert.deepEqual(calls[0]?.init, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify({
      tool: "sessions_list",
      args: { activeMinutes: 5 },
    }),
  });
});

test("gateway convenience wrappers invoke the expected tools and defaults", async () => {
  const calls = mockFetch([
    { ok: true, tool: "sessions_list" },
    { ok: true, tool: "sessions_send_default" },
    { ok: true, tool: "sessions_send_custom" },
    { ok: true, tool: "sessions_history" },
    { ok: true, tool: "cron" },
    { ok: true, tool: "gateway" },
  ]);

  assert.deepEqual(await gatewayClient.listSessions(), { ok: true, tool: "sessions_list" });
  assert.deepEqual(await gatewayClient.sendToSession("agent:main:main", "hello"), {
    ok: true,
    tool: "sessions_send_default",
  });
  assert.deepEqual(await gatewayClient.sendToSession("agent:main:main", "hello", 45), {
    ok: true,
    tool: "sessions_send_custom",
  });
  assert.deepEqual(await gatewayClient.getSessionHistory("agent:main:main"), {
    ok: true,
    tool: "sessions_history",
  });
  assert.deepEqual(await gatewayClient.listCrons(), { ok: true, tool: "cron" });
  assert.deepEqual(await gatewayClient.getConfig(), { ok: true, tool: "gateway" });

  assert.deepEqual(
    calls.map((call) => ({
      input: call.input,
      body: parseCallBody(call),
    })),
    [
      {
        input: "http://127.0.0.1:18789/tools/invoke",
        body: {
          tool: "sessions_list",
          args: {},
        },
      },
      {
        input: "http://127.0.0.1:18789/tools/invoke",
        body: {
          tool: "sessions_send",
          args: {
            sessionKey: "agent:main:main",
            message: "hello",
            timeoutSeconds: 30,
          },
        },
      },
      {
        input: "http://127.0.0.1:18789/tools/invoke",
        body: {
          tool: "sessions_send",
          args: {
            sessionKey: "agent:main:main",
            message: "hello",
            timeoutSeconds: 45,
          },
        },
      },
      {
        input: "http://127.0.0.1:18789/tools/invoke",
        body: {
          tool: "sessions_history",
          args: {
            sessionKey: "agent:main:main",
            limit: 50,
          },
        },
      },
      {
        input: "http://127.0.0.1:18789/tools/invoke",
        body: {
          tool: "cron",
          args: {
            action: "list",
          },
        },
      },
      {
        input: "http://127.0.0.1:18789/tools/invoke",
        body: {
          tool: "gateway",
          args: {
            action: "config.get",
          },
        },
      },
    ],
  );
});
