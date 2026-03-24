import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import express from "express";

import { createDatabase } from "../server/db.js";
import { createTasksRouter } from "../server/routes/tasks.js";

type BroadcastCall = {
  data: unknown;
  event: string;
};

async function createTestServer({
  workQueuePath = null,
}: {
  workQueuePath?: string | null;
} = {}) {
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
      workQueuePath,
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

test("tasks router creates child tasks and returns parent and children detail", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  const parentResponse = await requestApp(server.app, {
    body: JSON.stringify({
      title: "Launch plan",
    }),
    method: "POST",
    path: "/api/tasks",
  });

  assert.equal(parentResponse.status, 201);
  const parentTask = parentResponse.body?.task as Record<string, unknown>;
  const parentId = String(parentTask.id);

  const firstChildResponse = await requestApp(server.app, {
    body: JSON.stringify({
      parent_task_id: parentId,
      status: "done",
      title: "Ship API",
    }),
    method: "POST",
    path: "/api/tasks",
  });

  assert.equal(firstChildResponse.status, 201);
  const firstChild = firstChildResponse.body?.task as Record<string, unknown>;
  assert.equal(firstChild.parent_task_id, parentId);

  const secondChildResponse = await requestApp(server.app, {
    body: JSON.stringify({
      parent_task_id: parentId,
      status: "review",
      title: "Verify UI",
    }),
    method: "POST",
    path: "/api/tasks",
  });

  assert.equal(secondChildResponse.status, 201);
  const secondChild = secondChildResponse.body?.task as Record<string, unknown>;
  assert.equal(secondChild.parent_task_id, parentId);

  const parentDetailResponse = await requestApp(server.app, {
    path: `/api/tasks/${parentId}`,
  });

  assert.equal(parentDetailResponse.status, 200);
  const parentDetail = parentDetailResponse.body?.task as Record<string, unknown>;
  const parentChildren = parentDetail.children as Array<Record<string, unknown>>;

  assert.equal(parentDetail.parent, null);
  assert.equal(parentDetail.child_count, 2);
  assert.deepEqual(parentDetail.completion_stats, {
    completed: 1,
    total: 2,
  });
  assert.deepEqual(
    new Set(parentChildren.map((child) => child.id)),
    new Set([firstChild.id, secondChild.id]),
  );

  const childDetailResponse = await requestApp(server.app, {
    path: `/api/tasks/${String(firstChild.id)}`,
  });

  assert.equal(childDetailResponse.status, 200);
  const childDetail = childDetailResponse.body?.task as Record<string, unknown>;
  const childParent = childDetail.parent as Record<string, unknown>;

  assert.equal(childDetail.child_count, 0);
  assert.deepEqual(childDetail.children, []);
  assert.equal(childParent.id, parentId);
  assert.equal(childParent.child_count, 2);
  assert.deepEqual(childParent.completion_stats, {
    completed: 1,
    total: 2,
  });

  const invalidParentResponse = await requestApp(server.app, {
    body: JSON.stringify({
      parent_task_id: "missing-task",
      title: "Broken child",
    }),
    method: "POST",
    path: "/api/tasks",
  });

  assert.equal(invalidParentResponse.status, 400);
  assert.deepEqual(invalidParentResponse.body, {
    error: "Parent task not found.",
  });
});

test("tasks router filters list responses by status, assignee, plan, and parent", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("plan-a", "Plan A", "in_progress", "agent-1", 1, 6);
  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, parent_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("child-a", "Child A", "done", "agent-1", "plan-a", 2, 5);
  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, parent_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("child-b", "Child B", "review", "agent-2", "plan-a", 3, 4);
  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("task-solo", "Standalone", "review", "agent-1", 4, 3);
  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("plan-b", "Plan B", "review", "agent-2", 5, 2);
  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, parent_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("child-c", "Child C", "done", "agent-1", "plan-b", 6, 1);

  const reviewResponse = await requestApp(server.app, { path: "/api/tasks?status=review" });
  const reviewTasks = reviewResponse.body?.tasks as Array<Record<string, unknown>>;

  assert.equal(reviewResponse.status, 200);
  assert.deepEqual(reviewTasks.map((task) => task.id), ["child-b", "task-solo", "plan-b"]);
  assert.equal(reviewTasks[2]?.child_count, 1);
  assert.deepEqual(reviewTasks[2]?.completion_stats, {
    completed: 1,
    total: 1,
  });

  const assigneeResponse = await requestApp(server.app, { path: "/api/tasks?assignee=agent-1" });
  const assigneeTasks = assigneeResponse.body?.tasks as Array<Record<string, unknown>>;

  assert.equal(assigneeResponse.status, 200);
  assert.deepEqual(assigneeTasks.map((task) => task.id), [
    "plan-a",
    "child-a",
    "task-solo",
    "child-c",
  ]);
  assert.ok(assigneeTasks.every((task) => task.assignee_agent_id === "agent-1"));
  assert.equal(assigneeTasks[0]?.child_count, 2);
  assert.deepEqual(assigneeTasks[0]?.completion_stats, {
    completed: 1,
    total: 2,
  });

  const combinedResponse = await requestApp(server.app, {
    path: "/api/tasks?status=review&assignee=agent-1",
  });
  const combinedTasks = combinedResponse.body?.tasks as Array<Record<string, unknown>>;

  assert.equal(combinedResponse.status, 200);
  assert.deepEqual(combinedTasks.map((task) => task.id), ["task-solo"]);

  const planResponse = await requestApp(server.app, { path: "/api/tasks?plan=true" });
  const planTasks = planResponse.body?.tasks as Array<Record<string, unknown>>;

  assert.equal(planResponse.status, 200);
  assert.deepEqual(planTasks.map((task) => task.id), ["plan-a", "plan-b"]);
  assert.ok(planTasks.every((task) => Number(task.child_count) > 0));

  const childrenResponse = await requestApp(server.app, {
    path: "/api/tasks?parent_id=plan-a",
  });
  const childTasks = childrenResponse.body?.tasks as Array<Record<string, unknown>>;

  assert.equal(childrenResponse.status, 200);
  assert.deepEqual(childTasks.map((task) => task.id), ["child-a", "child-b"]);
  assert.ok(childTasks.every((task) => task.parent_task_id === "plan-a"));

  const invalidResponse = await requestApp(server.app, { path: "/api/tasks?status=invalid" });
  const invalidPlanResponse = await requestApp(server.app, { path: "/api/tasks?plan=maybe" });

  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(invalidResponse.body, { error: "Invalid status filter." });
  assert.equal(invalidPlanResponse.status, 400);
  assert.deepEqual(invalidPlanResponse.body, { error: "Invalid plan filter." });
});

test("tasks router auto-generates artifacts from work-queue metadata on detail responses", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "task-artifacts",
      "Ship board bridge",
      "in_progress",
      JSON.stringify({
        artifacts: [
          {
            label: "Deploy URL",
            type: "url",
            value: "https://deploy.example.com",
          },
          {
            label: "Runbook",
            type: "url",
            value: "https://docs.example.com/runbook",
          },
        ],
        source: "agent-work-queue",
        work_queue: {
          deploy_url: "https://deploy.example.com",
          prd_file: "docs/spec.md",
          project_dir: "/home/ubuntu/Projects/mission-control",
        },
        work_queue_id: "queue-1",
      }),
      1,
      1,
    );

  const response = await requestApp(server.app, {
    path: "/api/tasks/task-artifacts",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    (response.body?.task as Record<string, unknown>).metadata,
    {
      artifacts: [
        {
          label: "Deploy URL",
          type: "url",
          value: "https://deploy.example.com",
        },
        {
          label: "Runbook",
          type: "url",
          value: "https://docs.example.com/runbook",
        },
        {
          label: "PRD",
          type: "file",
          value: "/home/ubuntu/Projects/mission-control/docs/spec.md",
        },
        {
          label: "Project directory",
          type: "file",
          value: "/home/ubuntu/Projects/mission-control",
        },
      ],
      source: "agent-work-queue",
      work_queue: {
        deploy_url: "https://deploy.example.com",
        prd_file: "docs/spec.md",
        project_dir: "/home/ubuntu/Projects/mission-control",
      },
      work_queue_id: "queue-1",
    },
  );
});

test("tasks router auto-generates artifacts from top-level task metadata on detail responses", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "task-top-level-artifacts",
      "Document launch",
      "review",
      JSON.stringify({
        deploy_url: "https://launch.example.com",
        prd_file: "docs/launch.md",
        project_dir: "/tmp/launch-project",
      }),
      1,
      1,
    );

  const response = await requestApp(server.app, {
    path: "/api/tasks/task-top-level-artifacts",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    ((response.body?.task as Record<string, unknown>).metadata as Record<string, unknown>).artifacts,
    [
      {
        label: "Deploy URL",
        type: "url",
        value: "https://launch.example.com",
      },
      {
        label: "PRD",
        type: "file",
        value: "/tmp/launch-project/docs/launch.md",
      },
      {
        label: "Project directory",
        type: "file",
        value: "/tmp/launch-project",
      },
    ],
  );
});

test("tasks router adds artifacts to task metadata and broadcasts updates", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "task-add-artifact",
      "Publish release notes",
      "review",
      "agent-7",
      JSON.stringify({
        artifacts: [
          {
            label: "Runbook",
            type: "url",
            value: "https://docs.example.com/runbook",
          },
        ],
        source: "manual",
      }),
      10,
      10,
    );

  const response = await requestApp(server.app, {
    body: JSON.stringify({
      label: "Deployment",
      type: "url",
      value: "https://deploy.example.com/release",
    }),
    method: "POST",
    path: "/api/tasks/task-add-artifact/artifacts",
  });

  assert.equal(response.status, 201);
  assert.deepEqual(
    (response.body?.task as Record<string, unknown>).metadata,
    {
      artifacts: [
        {
          label: "Runbook",
          type: "url",
          value: "https://docs.example.com/runbook",
        },
        {
          label: "Deployment",
          type: "url",
          value: "https://deploy.example.com/release",
        },
      ],
      source: "manual",
    },
  );

  const storedTask = server.db
    .prepare("SELECT metadata, updated_at FROM tasks WHERE id = ?")
    .get("task-add-artifact") as { metadata: string; updated_at: number };
  const storedMetadata = JSON.parse(storedTask.metadata) as Record<string, unknown>;
  const activities = server.db
    .prepare("SELECT type, message, metadata FROM activities WHERE task_id = ? ORDER BY rowid ASC")
    .all("task-add-artifact") as Array<{ metadata: string; message: string; type: string }>;

  assert.deepEqual(storedMetadata, {
    artifacts: [
      {
        label: "Runbook",
        type: "url",
        value: "https://docs.example.com/runbook",
      },
      {
        label: "Deployment",
        type: "url",
        value: "https://deploy.example.com/release",
      },
    ],
    source: "manual",
  });
  assert.ok(storedTask.updated_at >= 10);
  assert.deepEqual(
    activities.map((activity) => activity.type),
    ["task_updated"],
  );
  assert.match(activities[0]?.message ?? "", /Added artifact "Deployment"/);
  assert.deepEqual(JSON.parse(activities[0]?.metadata ?? "null"), {
    artifact: {
      label: "Deployment",
      type: "url",
      value: "https://deploy.example.com/release",
    },
  });
  assert.deepEqual(
    server.broadcasts.map((call) => call.event),
    ["activity", "task_updated"],
  );
});

test("tasks router removes artifacts from task metadata and broadcasts updates", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, assignee_agent_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "task-delete-artifact",
      "Publish changelog",
      "review",
      "agent-8",
      JSON.stringify({
        artifacts: [
          {
            label: "Runbook",
            type: "url",
            value: "https://docs.example.com/runbook",
          },
          {
            label: "Deployment",
            type: "url",
            value: "https://deploy.example.com/release",
          },
        ],
        source: "manual",
      }),
      20,
      20,
    );

  const response = await requestApp(server.app, {
    method: "DELETE",
    path: "/api/tasks/task-delete-artifact/artifacts/1",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    (response.body?.task as Record<string, unknown>).metadata,
    {
      artifacts: [
        {
          label: "Runbook",
          type: "url",
          value: "https://docs.example.com/runbook",
        },
      ],
      source: "manual",
    },
  );

  const storedTask = server.db
    .prepare("SELECT metadata, updated_at FROM tasks WHERE id = ?")
    .get("task-delete-artifact") as { metadata: string; updated_at: number };
  const storedMetadata = JSON.parse(storedTask.metadata) as Record<string, unknown>;
  const activities = server.db
    .prepare("SELECT type, message, metadata FROM activities WHERE task_id = ? ORDER BY rowid ASC")
    .all("task-delete-artifact") as Array<{ metadata: string; message: string; type: string }>;

  assert.deepEqual(storedMetadata, {
    artifacts: [
      {
        label: "Runbook",
        type: "url",
        value: "https://docs.example.com/runbook",
      },
    ],
    source: "manual",
  });
  assert.ok(storedTask.updated_at >= 20);
  assert.deepEqual(
    activities.map((activity) => activity.type),
    ["task_updated"],
  );
  assert.match(activities[0]?.message ?? "", /Removed artifact "Deployment"/);
  assert.deepEqual(JSON.parse(activities[0]?.metadata ?? "null"), {
    artifact: {
      label: "Deployment",
      type: "url",
      value: "https://deploy.example.com/release",
    },
  });
  assert.deepEqual(
    server.broadcasts.map((call) => call.event),
    ["activity", "task_updated"],
  );
});

test("tasks router validates artifact payloads and missing tasks", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run("task-invalid-artifact", "Audit release", "inbox", 1, 1);

  const invalidTypeResponse = await requestApp(server.app, {
    body: JSON.stringify({
      label: "Deployment",
      type: "blob",
      value: "https://deploy.example.com/release",
    }),
    method: "POST",
    path: "/api/tasks/task-invalid-artifact/artifacts",
  });

  assert.equal(invalidTypeResponse.status, 400);
  assert.deepEqual(invalidTypeResponse.body, {
    error: "type must be either file or url.",
  });

  const missingTaskResponse = await requestApp(server.app, {
    body: JSON.stringify({
      label: "Deployment",
      type: "url",
      value: "https://deploy.example.com/release",
    }),
    method: "POST",
    path: "/api/tasks/missing-task/artifacts",
  });

  assert.equal(missingTaskResponse.status, 404);
  assert.deepEqual(missingTaskResponse.body, {
    error: "Task not found.",
  });
});

test("tasks router validates artifact deletion indexes and missing tasks", async (t) => {
  const server = await createTestServer();
  t.after(async () => {
    server.close();
  });

  server.db
    .prepare(
      `INSERT INTO tasks (id, title, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "task-delete-invalid-artifact",
      "Audit release",
      "inbox",
      JSON.stringify({
        artifacts: [
          {
            label: "Deployment",
            type: "url",
            value: "https://deploy.example.com/release",
          },
        ],
      }),
      1,
      1,
    );

  const invalidIndexResponse = await requestApp(server.app, {
    method: "DELETE",
    path: "/api/tasks/task-delete-invalid-artifact/artifacts/not-a-number",
  });

  assert.equal(invalidIndexResponse.status, 400);
  assert.deepEqual(invalidIndexResponse.body, {
    error: "index must be a non-negative integer.",
  });

  const missingArtifactResponse = await requestApp(server.app, {
    method: "DELETE",
    path: "/api/tasks/task-delete-invalid-artifact/artifacts/3",
  });

  assert.equal(missingArtifactResponse.status, 404);
  assert.deepEqual(missingArtifactResponse.body, {
    error: "Artifact not found.",
  });

  const missingTaskResponse = await requestApp(server.app, {
    method: "DELETE",
    path: "/api/tasks/missing-task/artifacts/0",
  });

  assert.equal(missingTaskResponse.status, 404);
  assert.deepEqual(missingTaskResponse.body, {
    error: "Task not found.",
  });
});

test("tasks router syncs work queue items into task list responses", async (t) => {
  const workQueueDir = await mkdtemp(join(tmpdir(), "mission-control-work-queue-"));
  const workQueuePath = join(workQueueDir, "agent-work-queue.json");
  const server = await createTestServer({ workQueuePath });

  t.after(async () => {
    server.close();
    await rm(workQueueDir, { force: true, recursive: true });
  });

  await writeFile(
    workQueuePath,
    JSON.stringify([
      {
        deploy_url: "https://deploy.example.com",
        harness: "playwright",
        id: "queue-1",
        loop_manager: "ralph",
        model: "gpt-5.4",
        name: "Ship board bridge",
        owner_agent: "agent-1",
        status: "running",
        tmux_session: "ralph.1",
      },
      {
        id: "queue-2",
        name: "Verify release",
        owner_agent: "agent-2",
        status: "completed",
      },
    ]),
  );

  const firstListResponse = await requestApp(server.app, { path: "/api/tasks" });
  const firstTasks = firstListResponse.body?.tasks as Array<Record<string, unknown>>;
  const syncedRunningTask = firstTasks.find(
    (task) => (task.metadata as Record<string, unknown>)?.work_queue_id === "queue-1",
  );
  const syncedDoneTask = firstTasks.find(
    (task) => (task.metadata as Record<string, unknown>)?.work_queue_id === "queue-2",
  );

  assert.equal(firstListResponse.status, 200);
  assert.equal(firstTasks.length, 2);
  assert.equal(syncedRunningTask?.title, "Ship board bridge");
  assert.equal(syncedRunningTask?.status, "in_progress");
  assert.equal(syncedRunningTask?.assignee_agent_id, "agent-1");
  assert.match(String(syncedRunningTask?.description), /Harness: playwright/);
  assert.match(String(syncedRunningTask?.description), /Loop Manager: ralph/);
  assert.equal(syncedDoneTask?.status, "done");
  assert.equal(syncedDoneTask?.assignee_agent_id, "agent-2");
  assert.equal(typeof syncedDoneTask?.completed_at, "number");

  await writeFile(
    workQueuePath,
    JSON.stringify([
      {
        harness: "playwright",
        id: "queue-1",
        name: "Ship board bridge",
        owner_agent: "agent-9",
        status: "failed",
      },
    ]),
  );

  const secondListResponse = await requestApp(server.app, { path: "/api/tasks" });
  const secondTasks = secondListResponse.body?.tasks as Array<Record<string, unknown>>;
  const updatedTask = secondTasks.find(
    (task) => (task.metadata as Record<string, unknown>)?.work_queue_id === "queue-1",
  );

  assert.equal(secondListResponse.status, 200);
  assert.equal(secondTasks.length, 2);
  assert.equal(updatedTask?.id, syncedRunningTask?.id);
  assert.equal(updatedTask?.status, "review");
  assert.equal(updatedTask?.assignee_agent_id, "agent-9");
  assert.match(String(updatedTask?.description), /Harness: playwright/);
  assert.doesNotMatch(String(updatedTask?.description), /Loop Manager:/);
});
