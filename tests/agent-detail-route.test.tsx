import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { PassThrough } from "node:stream";

import express from "express";

import { createDatabase } from "../server/db.js";
import { createAgentsRouter } from "../server/routes/agents.js";

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
  request.headers = {
    host: "127.0.0.1",
  };

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

test("agents detail route returns sessions, tasks, and activity for one agent", async (t) => {
  const db = createDatabase(":memory:");
  t.after(() => {
    db.close();
  });

  db.prepare(
    `INSERT INTO tasks (
      id, title, status, priority, assignee_agent_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("task-1", "Review launch brief", "review", "normal", "alpha", 10, 30);
  db.prepare(
    `INSERT INTO tasks (
      id, title, status, priority, assignee_agent_id, parent_task_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("task-2", "Ship follow-up", "done", "normal", "alpha", "task-1", 11, 20);
  db.prepare(
    `INSERT INTO activities (
      id, type, agent_id, task_id, message, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("activity-1", "task_updated", "alpha", "task-1", "Reviewed task queue", '{"status":"review"}', 40);

  const app = express();
  app.use(
    "/api/agents",
    createAgentsRouter({
      db,
      getConfig: async () => ({
        agents: {
          list: [
            {
              id: "alpha",
              name: "Alpha",
              role: "Lead",
            },
          ],
        },
      }),
      listSessions: async () => ({
        sessions: [
          {
            agentId: "alpha",
            currentActivity: "Main loop",
            lastHeartbeat: 1_710_000_000,
            sessionKey: "agent:alpha:main",
          },
        ],
      }),
    }),
  );

  const response = await requestApp(app, { path: "/api/agents/alpha/detail" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    activities: [
      {
        agent_id: "alpha",
        created_at: 40,
        id: "activity-1",
        message: "Reviewed task queue",
        metadata: {
          status: "review",
        },
        task_id: "task-1",
        type: "task_updated",
      },
    ],
    sessions: [
      {
        agentId: "alpha",
        currentActivity: "Main loop",
        lastHeartbeat: 1_710_000_000_000,
        sessionKey: "agent:alpha:main",
      },
    ],
    tasks: [
      {
        assignee_agent_id: "alpha",
        child_count: 1,
        completed_at: null,
        completion_stats: {
          completed: 1,
          total: 1,
        },
        created_at: 10,
        created_by: null,
        description: null,
        id: "task-1",
        metadata: null,
        parent_task_id: null,
        priority: "normal",
        status: "review",
        title: "Review launch brief",
        updated_at: 30,
      },
      {
        assignee_agent_id: "alpha",
        child_count: 0,
        completed_at: null,
        completion_stats: {
          completed: 0,
          total: 0,
        },
        created_at: 11,
        created_by: null,
        description: null,
        id: "task-2",
        metadata: null,
        parent_task_id: "task-1",
        priority: "normal",
        status: "done",
        title: "Ship follow-up",
        updated_at: 20,
      },
    ],
  });
});
