import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { PassThrough } from "node:stream";

import express from "express";

import { createDatabase } from "../server/db.js";
import { createTasksRouter } from "../server/routes/tasks.js";

type BroadcastCall = {
  data: unknown;
  event: string;
};

async function createTestServer() {
  const db = createDatabase(":memory:");
  const broadcasts: BroadcastCall[] = [];
  const app = express();

  app.use(express.json());
  app.use(
    "/api/tasks",
    createTasksRouter({
      broadcaster: {
        broadcast(event, data) {
          broadcasts.push({ data, event });
        },
      },
      db,
    }),
  );

  return {
    app,
    broadcasts,
    db,
    close() {
      db.close();
    },
  };
}

async function requestApp(
  app: express.Express,
  {
    body,
    method = "GET",
    path,
  }: {
    body?: string;
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
    "content-length": body ? String(Buffer.byteLength(body)) : "0",
    "content-type": "application/json",
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
  request.push(body ?? null);
  if (body) {
    request.push(null);
  }
  await finished;

  return {
    body: (() => {
      const rawResponse = Buffer.concat(chunks).toString("utf8");
      const [, responseBody = ""] = rawResponse.split("\r\n\r\n");
      return responseBody ? (JSON.parse(responseBody) as Record<string, unknown>) : null;
    })(),
    status: response.statusCode,
  };
}

test("tasks router supports CRUD with comments, subtasks, activity logging, and SSE broadcasts", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  const createdTaskResponse = await requestApp(server.app, {
    body: JSON.stringify({
      assignee_agent_id: "agent-1",
      created_by: "operator",
      description: "Ship the API",
      priority: "high",
      title: "Implement tasks route",
    }),
    method: "POST",
    path: "/api/tasks",
  });

  assert.equal(createdTaskResponse.status, 201);
  const createdTask = createdTaskResponse.body?.task as Record<string, unknown>;
  assert.equal(createdTask.title, "Implement tasks route");
  assert.equal(createdTask.status, "inbox");
  assert.equal(createdTask.assignee_agent_id, "agent-1");

  const taskId = String(createdTask.id);

  const updatedTaskResponse = await requestApp(server.app, {
    body: JSON.stringify({
      assignee_agent_id: "agent-2",
      description: null,
      status: "review",
    }),
    method: "PATCH",
    path: `/api/tasks/${taskId}`,
  });

  assert.equal(updatedTaskResponse.status, 200);
  const updatedTask = updatedTaskResponse.body?.task as Record<string, unknown>;
  assert.equal(updatedTask.status, "review");
  assert.equal(updatedTask.assignee_agent_id, "agent-2");
  assert.equal(updatedTask.description, null);

  const commentResponse = await requestApp(server.app, {
    body: JSON.stringify({
      author: "agent-2",
      content: "Ready for review.",
    }),
    method: "POST",
    path: `/api/tasks/${taskId}/comments`,
  });

  assert.equal(commentResponse.status, 201);
  const comment = commentResponse.body?.comment as Record<string, unknown>;
  assert.equal(comment.author, "agent-2");
  assert.equal(comment.content, "Ready for review.");

  const subtaskResponse = await requestApp(server.app, {
    body: JSON.stringify({
      assignee_agent_id: "agent-2",
      sort_order: 2,
      status: "pending",
      title: "Write regression tests",
    }),
    method: "POST",
    path: `/api/tasks/${taskId}/subtasks`,
  });

  assert.equal(subtaskResponse.status, 201);
  const subtask = subtaskResponse.body?.subtask as Record<string, unknown>;
  assert.equal(subtask.title, "Write regression tests");
  assert.equal(subtask.done, false);

  const subtaskId = String(subtask.id);

  const completedSubtaskResponse = await requestApp(server.app, {
    body: JSON.stringify({
      status: "done",
    }),
    method: "PATCH",
    path: `/api/tasks/${taskId}/subtasks/${subtaskId}`,
  });

  assert.equal(completedSubtaskResponse.status, 200);
  const completedSubtask = completedSubtaskResponse.body?.subtask as Record<string, unknown>;
  assert.equal(completedSubtask.status, "done");
  assert.equal(completedSubtask.done, true);
  assert.equal(typeof completedSubtask.done_at, "number");

  const detailResponse = await requestApp(server.app, { path: `/api/tasks/${taskId}` });

  assert.equal(detailResponse.status, 200);
  const detailTask = detailResponse.body?.task as Record<string, unknown>;
  const detailComments = detailTask.comments as Array<Record<string, unknown>>;
  const detailSubtasks = detailTask.subtasks as Array<Record<string, unknown>>;

  assert.equal(detailComments.length, 1);
  assert.equal(detailSubtasks.length, 1);
  assert.equal(detailComments[0]?.content, "Ready for review.");
  assert.equal(detailSubtasks[0]?.status, "done");

  const deleteResponse = await requestApp(server.app, {
    method: "DELETE",
    path: `/api/tasks/${taskId}`,
  });

  assert.equal(deleteResponse.status, 204);

  const missingTaskResponse = await requestApp(server.app, { path: `/api/tasks/${taskId}` });
  assert.equal(missingTaskResponse.status, 404);

  const activities = server.db
    .prepare("SELECT type FROM activities ORDER BY rowid ASC")
    .all() as Array<{ type: string }>;
  const counts = {
    comments: server.db.prepare("SELECT COUNT(*) AS count FROM comments").get() as { count: number },
    subtasks: server.db.prepare("SELECT COUNT(*) AS count FROM subtasks").get() as { count: number },
  };

  assert.deepEqual(
    activities.map((activity) => activity.type),
    [
      "task_created",
      "task_status_changed",
      "message_sent",
      "task_updated",
      "subtask_completed",
      "task_deleted",
    ],
  );
  assert.equal(counts.comments.count, 0);
  assert.equal(counts.subtasks.count, 0);
  assert.equal(server.broadcasts.length, 12);
  assert.deepEqual(
    server.broadcasts.map((call) => call.event),
    [
      "activity",
      "task_created",
      "activity",
      "task_updated",
      "activity",
      "comment_added",
      "activity",
      "task_updated",
      "activity",
      "task_updated",
      "activity",
      "task_deleted",
    ],
  );
});

test("tasks router filters list responses by status and assignee", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("task-a", "Backlog", "in_progress", "agent-1", 1, 3);
  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("task-b", "Review", "review", "agent-1", 2, 2);
  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("task-c", "Done", "review", "agent-2", 3, 1);

  const reviewResponse = await requestApp(server.app, { path: "/api/tasks?status=review" });
  const reviewTasks = reviewResponse.body?.tasks as Array<Record<string, unknown>>;

  assert.equal(reviewResponse.status, 200);
  assert.equal(reviewTasks.length, 2);
  assert.deepEqual(
    new Set(reviewTasks.map((task) => task.id)),
    new Set(["task-b", "task-c"]),
  );

  const assigneeResponse = await requestApp(server.app, { path: "/api/tasks?assignee=agent-1" });
  const assigneeTasks = assigneeResponse.body?.tasks as Array<Record<string, unknown>>;

  assert.equal(assigneeResponse.status, 200);
  assert.equal(assigneeTasks.length, 2);
  assert.ok(assigneeTasks.every((task) => task.assignee_agent_id === "agent-1"));

  const combinedResponse = await requestApp(server.app, {
    path: "/api/tasks?status=review&assignee=agent-1",
  });
  const combinedTasks = combinedResponse.body?.tasks as Array<Record<string, unknown>>;

  assert.equal(combinedResponse.status, 200);
  assert.deepEqual(combinedTasks.map((task) => task.id), ["task-b"]);

  const invalidResponse = await requestApp(server.app, { path: "/api/tasks?status=invalid" });

  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(invalidResponse.body, { error: "Invalid status filter." });
});
