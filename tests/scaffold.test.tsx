import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { access } from "node:fs/promises";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { createDatabase } from "../server/db.js";
import { createApp } from "../server/index.js";
import { app } from "../server/index.js";
import { AppShell } from "../src/App";

const requiredPaths = [
  "server/index.ts",
  "server/db.ts",
  "server/routes/tasks.ts",
  "server/routes/activities.ts",
  "server/routes/agents.ts",
  "server/routes/chat.ts",
  "server/routes/gateway.ts",
  "server/routes/health.ts",
  "server/gateway-client.ts",
  "server/sse.ts",
  "src/main.tsx",
  "src/App.tsx",
  "src/pages/settings.tsx",
  "src/styles/globals.css",
  "src/components/kanban/.gitkeep",
  "src/components/agents/.gitkeep",
  "src/components/live-feed/.gitkeep",
  "src/components/chat/.gitkeep",
  "src/components/layout/.gitkeep",
  "src/components/ui/.gitkeep",
  "src/hooks/.gitkeep",
  "src/lib/.gitkeep",
  "vite.config.ts",
  "tailwind.config.ts",
  "tsconfig.json",
  "tsconfig.server.json",
];

async function requestApp(targetApp: ReturnType<typeof createApp>, path: string) {
  const socket = new PassThrough();
  const request = new IncomingMessage(socket);

  request.method = "GET";
  request.url = path;
  request.headers = { host: "127.0.0.1" };

  const response = new ServerResponse(request);
  const chunks: Buffer[] = [];

  socket.on("data", (chunk) => {
    chunks.push(Buffer.from(chunk));
  });

  const finished = new Promise<void>((resolve, reject) => {
    response.on("finish", resolve);
    response.on("error", reject);
  });

  response.assignSocket(socket);
  targetApp(request, response);
  await finished;

  const rawResponse = Buffer.concat(chunks).toString("utf8");
  const [, body = ""] = rawResponse.split("\r\n\r\n");

  return {
    body,
    headers: response.getHeaders(),
    status: response.statusCode,
  };
}

test("section 3 scaffold paths exist", async () => {
  await Promise.all(requiredPaths.map((path) => access(path)));
});

test("app renders the agents route", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/agents"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, /Squad/);
  assert.match(html, /Your AI agents and their current status\./);
});

test("health endpoint responds with ok", async () => {
  const startedAt = Date.now();
  const response = await requestApp(app, "/health");
  const finishedAt = Date.now();

  const body = JSON.parse(response.body) as {
    status: string;
    timestamp: string;
    uptime: number;
  };

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(typeof body.uptime, "number");
  assert.ok(Number.isFinite(body.uptime));
  assert.ok(body.uptime >= 0);

  const timestamp = Date.parse(body.timestamp);
  assert.ok(Number.isFinite(timestamp));
  assert.ok(timestamp >= startedAt);
  assert.ok(timestamp <= finishedAt);
});

test("createDatabase initializes the section 4 schema", () => {
  const db = createDatabase(":memory:");

  const task = db
    .prepare(
      "INSERT INTO tasks (title, created_by) VALUES (?, ?) RETURNING id, status, priority, created_by",
    )
    .get("Initial task", "human") as {
    created_by: string;
    id: string;
    priority: string;
    status: string;
  };

  assert.equal(task.status, "inbox");
  assert.equal(task.priority, "normal");
  assert.equal(task.created_by, "human");

  db.prepare("INSERT INTO subtasks (task_id, title) VALUES (?, ?)").run(task.id, "Subtask");
  db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, ?, ?)").run(
    task.id,
    "human",
    "Comment body",
  );
  db.prepare("INSERT INTO activities (type, agent_id, task_id, message) VALUES (?, ?, ?, ?)").run(
    "task_created",
    "marv",
    task.id,
    "Created the task",
  );

  const objects = db
    .prepare("SELECT name, type FROM sqlite_master WHERE name LIKE 'idx_activities_%' OR type = 'table'")
    .all() as Array<{ name: string; type: string }>;
  const names = new Set(objects.map((object) => object.name));

  assert.ok(names.has("tasks"));
  assert.ok(names.has("subtasks"));
  assert.ok(names.has("comments"));
  assert.ok(names.has("activities"));
  assert.ok(names.has("idx_activities_created"));
  assert.ok(names.has("idx_activities_agent"));

  db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);

  const remainingSubtasks = db.prepare("SELECT COUNT(*) AS count FROM subtasks").get() as {
    count: number;
  };
  const remainingComments = db.prepare("SELECT COUNT(*) AS count FROM comments").get() as {
    count: number;
  };

  assert.equal(remainingSubtasks.count, 0);
  assert.equal(remainingComments.count, 0);
  db.close();
});

test("createApp serves static assets and falls back to dist/client index", async () => {
  const clientDistPath = await mkdtemp(join(tmpdir(), "mission-control-client-"));

  await writeFile(join(clientDistPath, "index.html"), "<!doctype html><html><body>client shell</body></html>");
  await writeFile(join(clientDistPath, "app.js"), "console.log('asset');");

  const staticApp = createApp({ clientDistPath, initializeDatabase: false });

  try {
    const assetResponse = await requestApp(staticApp, "/app.js");
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.body, /asset/);

    const routeResponse = await requestApp(staticApp, "/settings");
    assert.equal(routeResponse.status, 200);
    assert.match(routeResponse.body, /client shell/);

    const apiResponse = await requestApp(staticApp, "/api/health");
    assert.equal(apiResponse.status, 200);
    assert.equal(JSON.parse(apiResponse.body).status, "ok");
  } finally {
    await rm(clientDistPath, { force: true, recursive: true });
  }
});
