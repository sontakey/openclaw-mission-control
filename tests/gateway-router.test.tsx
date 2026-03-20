import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { PassThrough } from "node:stream";

import express from "express";

import { GATEWAY_TOKEN, GATEWAY_URL } from "../server/gateway-client.js";
import { createGatewayRouter } from "../server/routes/gateway.js";

async function requestApp(
  app: express.Express,
  {
    method = "GET",
    path,
  }: {
    method?: string;
    path: string;
  },
) {
  const socket = new PassThrough();
  const request = new IncomingMessage(socket);
  const response = new ServerResponse(request);
  const chunks: Buffer[] = [];

  request.method = method;
  request.url = path;
  request.headers = { host: "127.0.0.1" };

  socket.on("data", (chunk) => {
    chunks.push(Buffer.from(chunk));
  });

  const finished = new Promise<void>((resolve, reject) => {
    response.on("finish", resolve);
    response.on("error", reject);
  });

  response.assignSocket(socket);
  app(request, response);
  await finished;

  const rawResponse = Buffer.concat(chunks).toString("utf8");
  const [, responseBody = ""] = rawResponse.split("\r\n\r\n");

  return {
    body: responseBody ? (JSON.parse(responseBody) as unknown) : null,
    status: response.statusCode,
  };
}

function createTestApp(options: Parameters<typeof createGatewayRouter>[0]) {
  const app = express();
  app.use("/api/gateway", createGatewayRouter(options));
  return app;
}

test("gateway router returns normalized config and cron payloads", async () => {
  const app = createTestApp({
    getConfig: async () => ({
      result: {
        content: [
          {
            text: JSON.stringify({
              agents: {
                list: [{ id: "alpha" }],
              },
              mode: "production",
            }),
          },
        ],
      },
    }),
    listCrons: async () => ({
      result: {
        content: [
          {
            text: JSON.stringify({
              crons: [
                {
                  enabled: true,
                  lastRunAt: "2026-03-20T10:00:00.000Z",
                  name: "Heartbeat sync",
                  nextRunAt: 1_742_470_400,
                  schedule: "*/5 * * * *",
                },
              ],
            }),
          },
        ],
      },
    }),
  });

  const configResponse = await requestApp(app, { path: "/api/gateway/config" });
  const cronsResponse = await requestApp(app, { path: "/api/gateway/crons" });

  assert.equal(configResponse.status, 200);
  assert.deepEqual(configResponse.body, {
    config: {
      agents: {
        list: [{ id: "alpha" }],
      },
      mode: "production",
    },
    connection: {
      hasToken: Boolean(GATEWAY_TOKEN),
      status: "connected",
      url: GATEWAY_URL,
    },
  });

  assert.equal(cronsResponse.status, 200);
  assert.deepEqual(cronsResponse.body, {
    crons: [
      {
        id: "cron-1",
        isActive: true,
        lastRunAt: Date.parse("2026-03-20T10:00:00.000Z"),
        name: "Heartbeat sync",
        nextRunAt: 1_742_470_400_000,
        schedule: "*/5 * * * *",
      },
    ],
  });
});

test("gateway router returns 502 when gateway calls fail", async () => {
  const app = createTestApp({
    getConfig: async () => {
      throw new Error("boom");
    },
    listCrons: async () => {
      throw new Error("boom");
    },
  });

  const configResponse = await requestApp(app, { path: "/api/gateway/config" });
  const cronsResponse = await requestApp(app, { path: "/api/gateway/crons" });

  assert.equal(configResponse.status, 502);
  assert.deepEqual(configResponse.body, {
    error: "Failed to load gateway config.",
  });

  assert.equal(cronsResponse.status, 502);
  assert.deepEqual(cronsResponse.body, {
    error: "Failed to load gateway cron jobs.",
  });
});
