import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { join } from "node:path";
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

function createTestApp() {
  const db = createDatabase(":memory:");
  const app = express();

  app.use("/api/tasks", createTasksRouter({ broadcaster: { broadcast() {} }, db }));

  return {
    app,
    db,
    close() {
      db.close();
    },
  };
}

test("tasks router returns PRD content for work-queue-backed tasks with a linked markdown file", async (t) => {
  const tempRoot = await mkdtemp(join(process.cwd(), ".tmp-prd-router-"));
  const projectDir = join(tempRoot, "project");
  const prdPath = join(projectDir, "docs", "spec.md");
  const server = createTestApp();

  t.after(async () => {
    server.close();
    await rm(tempRoot, { force: true, recursive: true });
  });

  await mkdir(join(projectDir, "docs"), { recursive: true });
  await writeFile(prdPath, "# Mission\n\nShip the PRD endpoint.\n");

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
          prd_file: "docs/spec.md",
          project_dir: projectDir,
        },
        work_queue_id: "queue-1",
      }),
      1,
      1,
    );

  const response = await requestApp(server.app, {
    path: "/api/tasks/task-1/prd",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.exists, true);
  assert.equal(response.body?.path, prdPath);
  assert.equal(response.body?.content, "# Mission\n\nShip the PRD endpoint.\n");
});

test("tasks router returns an empty PRD payload when the task has no linked PRD file", async (t) => {
  const server = createTestApp();

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
          project_dir: "/home/ubuntu/Projects/mission-control",
        },
        work_queue_id: "queue-1",
      }),
      1,
      1,
    );

  const response = await requestApp(server.app, {
    path: "/api/tasks/task-1/prd",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    content: null,
    exists: false,
    path: null,
  });
});

test("tasks router rejects PRD path traversal attempts", async (t) => {
  const tempRoot = await mkdtemp(join(process.cwd(), ".tmp-prd-router-"));
  const projectDir = join(tempRoot, "project");
  const server = createTestApp();

  t.after(async () => {
    server.close();
    await rm(tempRoot, { force: true, recursive: true });
  });

  await mkdir(projectDir, { recursive: true });

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
          prd_file: "../spec.md",
          project_dir: projectDir,
        },
        work_queue_id: "queue-1",
      }),
      1,
      1,
    );

  const response = await requestApp(server.app, {
    path: "/api/tasks/task-1/prd",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Invalid PRD path.",
  });
});

test("tasks router rejects normalized PRD traversal paths that stay within the project", async (t) => {
  const tempRoot = await mkdtemp(join(process.cwd(), ".tmp-prd-router-"));
  const projectDir = join(tempRoot, "project");
  const prdPath = join(projectDir, "spec.md");
  const server = createTestApp();

  t.after(async () => {
    server.close();
    await rm(tempRoot, { force: true, recursive: true });
  });

  await mkdir(join(projectDir, "docs"), { recursive: true });
  await writeFile(prdPath, "# Mission\n\nShip the PRD endpoint.\n");

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
          prd_file: "docs/../spec.md",
          project_dir: projectDir,
        },
        work_queue_id: "queue-1",
      }),
      1,
      1,
    );

  const response = await requestApp(server.app, {
    path: "/api/tasks/task-1/prd",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Invalid PRD path.",
  });
});
