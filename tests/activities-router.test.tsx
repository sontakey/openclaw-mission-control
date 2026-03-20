import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { PassThrough } from "node:stream";

import express from "express";

import { createDatabase } from "../server/db.js";
import { createActivitiesRouter, type ActivitiesSseBroadcaster } from "../server/routes/activities.js";
import type { SseClient } from "../server/sse.js";

async function createTestServer({
  broadcaster,
}: {
  broadcaster?: ActivitiesSseBroadcaster;
} = {}) {
  const db = createDatabase(":memory:");
  const app = express();

  app.use("/api/activities", createActivitiesRouter({ broadcaster, db }));

  return {
    app,
    db,
    close() {
      db.close();
    },
  };
}

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
  request.push(null);
  await finished;

  const rawResponse = Buffer.concat(chunks).toString("utf8");
  const [, responseBody = ""] = rawResponse.split("\r\n\r\n");

  return {
    body: responseBody ? (JSON.parse(responseBody) as Record<string, unknown>) : null,
    status: response.statusCode,
  };
}

test("activities router lists activities with pagination in reverse chronological order", async (t) => {
  const server = await createTestServer();
  t.after(() => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO activities (id, type, agent_id, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("activity-a", "task_created", "agent-1", "task-1", "Created task", null, 10);
  server.db
    .prepare(
      `INSERT INTO activities (id, type, agent_id, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("activity-b", "task_updated", "agent-2", "task-2", "Updated task", '{"status":"review"}', 30);
  server.db
    .prepare(
      `INSERT INTO activities (id, type, agent_id, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("activity-c", "message_sent", "agent-3", "task-3", "Commented", 'plain-text', 20);

  const response = await requestApp(server.app, {
    path: "/api/activities?limit=2&offset=1",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    (response.body?.activities as Array<Record<string, unknown>>).map((activity) => activity.id),
    ["activity-c", "activity-a"],
  );
  assert.equal((response.body?.activities as Array<Record<string, unknown>>)[0]?.metadata, "plain-text");
  assert.equal((response.body?.activities as Array<Record<string, unknown>>)[1]?.metadata, null);
});

test("activities router rejects invalid pagination params", async (t) => {
  const server = await createTestServer();
  t.after(() => {
    server.close();
  });

  const invalidLimitResponse = await requestApp(server.app, {
    path: "/api/activities?limit=0",
  });
  assert.equal(invalidLimitResponse.status, 400);
  assert.deepEqual(invalidLimitResponse.body, {
    error: "limit must be a positive integer.",
  });

  const invalidOffsetResponse = await requestApp(server.app, {
    path: "/api/activities?offset=-1",
  });
  assert.equal(invalidOffsetResponse.status, 400);
  assert.deepEqual(invalidOffsetResponse.body, {
    error: "offset must be a non-negative integer.",
  });
});

test("activities router stream endpoint registers and removes SSE clients", async (t) => {
  const addedClients: SseClient[] = [];
  const removedClients: SseClient[] = [];
  const broadcaster: ActivitiesSseBroadcaster = {
    addClient(client) {
      addedClients.push(client);
    },
    removeClient(client) {
      removedClients.push(client);
    },
  };
  const server = await createTestServer({ broadcaster });
  t.after(() => {
    server.close();
  });

  const socket = new PassThrough();
  const request = new IncomingMessage(socket);
  const response = new ServerResponse(request);

  request.method = "GET";
  request.url = "/api/activities/stream";
  request.headers = { host: "127.0.0.1" };

  response.assignSocket(socket);
  server.app(request, response);

  assert.equal(addedClients.length, 1);
  assert.equal(addedClients[0], response);

  request.emit("close");

  assert.deepEqual(removedClients, [response]);
});
