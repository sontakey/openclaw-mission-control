import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { PassThrough } from "node:stream";

import express from "express";

import { createDatabase } from "../server/db.js";
import { createTasksRouter } from "../server/routes/tasks.js";

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
    body: responseBody ? (JSON.parse(responseBody) as Record<string, unknown>) : null,
    status: response.statusCode,
  };
}

function createTestApp(options: Parameters<typeof createTasksRouter>[0]) {
  const db = createDatabase(":memory:");
  const app = express();

  app.use("/api/tasks", createTasksRouter({ broadcaster: { broadcast() {} }, db, ...options }));

  return {
    app,
    db,
    close() {
      db.close();
    },
  };
}

test("tasks router returns tmux output for work-queue-backed tasks", async (t) => {
  const tmuxCalls: Array<{ lines: number; session: string }> = [];
  const server = createTestApp({
    captureTmuxOutput: async (session, lines) => {
      tmuxCalls.push({ lines, session });
      return "boot\nrunning\nready";
    },
  });

  t.after(() => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "task-1",
      "Ship board bridge",
      "in_progress",
      JSON.stringify({
        source: "agent-work-queue",
        work_queue: {
          loop_manager: "ralph",
          tmux_session: "ralph.1",
        },
        work_queue_id: "queue-1",
      }),
      1,
      1,
    );

  const response = await requestApp(server.app, {
    path: "/api/tasks/task-1/tmux-output",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.session, "ralph.1");
  assert.equal(response.body?.output, "boot\nrunning\nready");
  assert.equal(typeof response.body?.capturedAt, "number");
  assert.deepEqual(tmuxCalls, [{ lines: 200, session: "ralph.1" }]);
});

test("tasks router rejects tmux output requests for tasks without a tmux session", async (t) => {
  const server = createTestApp({
    captureTmuxOutput: async () => "unused",
  });

  t.after(() => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("task-1", "Ship board bridge", "in_progress", JSON.stringify({ source: "manual" }), 1, 1);

  const response = await requestApp(server.app, {
    path: "/api/tasks/task-1/tmux-output",
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: "Task has no tmux session.",
  });
});
