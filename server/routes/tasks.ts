import { Router } from "express";
import type { Response } from "express";

import type { MissionControlDatabase } from "../db.js";
import { getDatabase } from "../db.js";
import { sse } from "../sse.js";
import type { SseEventMap } from "../sse.js";
import { captureTmuxOutput as captureTaskTmuxOutput, DEFAULT_TMUX_CAPTURE_LINES } from "../tmux.js";
import { syncWorkQueueToTasks } from "../work-queue.js";

const TASK_STATUSES = new Set(["inbox", "assigned", "in_progress", "review", "done"]);
const TASK_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const COMMENT_TYPES = new Set(["comment", "status_change", "system"]);
const SUBTASK_STATUSES = new Set(["pending", "in_progress", "done", "blocked"]);

type TaskRow = {
  assignee_agent_id: string | null;
  completed_at: number | null;
  created_at: number;
  created_by: string | null;
  description: string | null;
  id: string;
  metadata: string | null;
  parent_task_id: string | null;
  priority: string;
  status: string;
  title: string;
  updated_at: number;
};

type TaskSummaryRow = TaskRow & {
  child_count: number;
  completed_child_count: number;
};

type SubtaskRow = {
  assignee_agent_id: string | null;
  blocked_reason: string | null;
  done: number;
  done_at: number | null;
  id: string;
  sort_order: number;
  status: string;
  task_id: string;
  title: string;
};

type CommentRow = {
  author: string;
  content: string;
  created_at: number;
  id: string;
  task_id: string;
  type: string;
};

type ActivityRow = {
  agent_id: string | null;
  created_at: number;
  id: string;
  message: string;
  metadata: string | null;
  task_id: string | null;
  type: string;
};

type BroadcastEvent = {
  data:
    | SseEventMap["comment_added"]
    | SseEventMap["task_created"]
    | SseEventMap["task_deleted"]
    | SseEventMap["task_updated"];
  event: "comment_added" | "task_created" | "task_deleted" | "task_updated";
};

type ActivityInput = {
  agentId?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
  taskId?: string | null;
  type: string;
};

export type TaskSseBroadcaster = {
  broadcast<EventType extends keyof SseEventMap>(event: EventType, data: SseEventMap[EventType]): void;
};

type CreateTasksRouterOptions = {
  broadcaster?: TaskSseBroadcaster;
  captureTmuxOutput?: (session: string, lines: number) => Promise<string>;
  db?: MissionControlDatabase;
  workQueuePath?: string | null;
};

function getSingleValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function getTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getOptionalString(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getOptionalInteger(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value)) {
    return undefined;
  }

  return Number(value);
}

function getOptionalBoolean(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    return undefined;
  }

  return value;
}

function getOptionalQueryBoolean(value: unknown) {
  const normalized = getTrimmedString(getSingleValue(value));

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function getMetadataRecord(value: string | null) {
  const parsed = parseJson(value);
  return isRecord(parsed) ? parsed : null;
}

function getRecordString(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();

    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

function getTaskTmuxSession(task: TaskRow) {
  const metadata = getMetadataRecord(task.metadata);
  const workQueue = isRecord(metadata?.work_queue) ? metadata.work_queue : null;

  return (
    getRecordString(workQueue, ["tmux_session", "tmuxSession"]) ??
    getRecordString(metadata, ["tmux_session", "tmuxSession"])
  );
}

function serializeTask(task: TaskRow) {
  return {
    ...task,
    metadata: parseJson(task.metadata),
  };
}

function serializeTaskSummary(task: TaskSummaryRow) {
  const { child_count, completed_child_count, ...taskRow } = task;
  const childCount = Number(child_count);

  return {
    ...serializeTask(taskRow),
    child_count: childCount,
    completion_stats: {
      completed: Number(completed_child_count),
      total: childCount,
    },
  };
}

function serializeSubtask(subtask: SubtaskRow) {
  return {
    ...subtask,
    done: Boolean(subtask.done),
  };
}

function serializeComment(comment: CommentRow) {
  return comment;
}

function serializeActivity(activity: ActivityRow) {
  return {
    ...activity,
    metadata: parseJson(activity.metadata),
  };
}

function toActivityPayload(activity: ActivityRow) {
  return JSON.parse(JSON.stringify(serializeActivity(activity))) as SseEventMap["activity"]["activity"];
}

function toTaskPayload(task: unknown) {
  return JSON.parse(JSON.stringify(task)) as SseEventMap["task_updated"]["task"];
}

function toCommentPayload(comment: unknown) {
  return JSON.parse(JSON.stringify(comment)) as SseEventMap["comment_added"]["comment"];
}

function sendBadRequest(response: Response, error: string) {
  response.status(400).json({ error });
}

function sendNotFound(response: Response, error = "Task not found.") {
  response.status(404).json({ error });
}

function getTaskById(db: MissionControlDatabase, taskId: string) {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as TaskRow | undefined;
}

const TASK_SUMMARY_SELECT = `
  SELECT
    tasks.*,
    COUNT(child_tasks.id) AS child_count,
    COALESCE(SUM(CASE WHEN child_tasks.status = 'done' THEN 1 ELSE 0 END), 0) AS completed_child_count
  FROM tasks
  LEFT JOIN tasks AS child_tasks ON child_tasks.parent_task_id = tasks.id
`;

function getTaskSummaryById(db: MissionControlDatabase, taskId: string) {
  return db
    .prepare(
      `${TASK_SUMMARY_SELECT}
       WHERE tasks.id = ?
       GROUP BY tasks.id`,
    )
    .get(taskId) as TaskSummaryRow | undefined;
}

function listTaskSummaries(
  db: MissionControlDatabase,
  {
    assignee,
    parentId,
    plan,
    status,
  }: {
    assignee?: string;
    parentId?: string;
    plan?: boolean;
    status?: string;
  } = {},
) {
  const conditions: string[] = [];
  const values: string[] = [];

  if (status) {
    conditions.push("tasks.status = ?");
    values.push(status);
  }

  if (assignee) {
    conditions.push("tasks.assignee_agent_id = ?");
    values.push(assignee);
  }

  if (parentId) {
    conditions.push("tasks.parent_task_id = ?");
    values.push(parentId);
  }

  if (plan === true) {
    conditions.push("EXISTS (SELECT 1 FROM tasks AS plan_children WHERE plan_children.parent_task_id = tasks.id)");
  } else if (plan === false) {
    conditions.push(
      "NOT EXISTS (SELECT 1 FROM tasks AS plan_children WHERE plan_children.parent_task_id = tasks.id)",
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(
      `${TASK_SUMMARY_SELECT}
       ${whereClause}
       GROUP BY tasks.id
       ORDER BY tasks.updated_at DESC, tasks.created_at DESC, tasks.id DESC`,
    )
    .all(...values) as TaskSummaryRow[];
}

function getSubtaskById(db: MissionControlDatabase, taskId: string, subtaskId: string) {
  return db
    .prepare("SELECT * FROM subtasks WHERE id = ? AND task_id = ?")
    .get(subtaskId, taskId) as SubtaskRow | undefined;
}

function getTaskDetail(db: MissionControlDatabase, taskId: string) {
  const task = getTaskSummaryById(db, taskId);

  if (!task) {
    return undefined;
  }

  const subtasks = db
    .prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC, id ASC")
    .all(taskId) as SubtaskRow[];
  const comments = db
    .prepare("SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC, id ASC")
    .all(taskId) as CommentRow[];
  const parent = task.parent_task_id ? getTaskSummaryById(db, task.parent_task_id) ?? null : null;
  const children = listTaskSummaries(db, { parentId: task.id });

  return {
    ...serializeTaskSummary(task),
    comments: comments.map(serializeComment),
    children: children.map(serializeTaskSummary),
    parent: parent ? serializeTaskSummary(parent) : null,
    subtasks: subtasks.map(serializeSubtask),
  };
}

function insertActivity(db: MissionControlDatabase, activity: ActivityInput) {
  const createdAt = Math.floor(Date.now() / 1000);
  const metadata = activity.metadata === undefined ? null : JSON.stringify(activity.metadata);

  return db
    .prepare(
      `INSERT INTO activities (type, agent_id, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .get(
      activity.type,
      activity.agentId ?? null,
      activity.taskId ?? null,
      activity.message,
      metadata,
      createdAt,
    ) as ActivityRow;
}

function runInTransaction<T>(db: MissionControlDatabase, callback: () => T) {
  db.exec("BEGIN");

  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function emitMutation(
  broadcaster: TaskSseBroadcaster,
  activity: ActivityRow,
  event: BroadcastEvent,
) {
  broadcaster.broadcast("activity", { activity: toActivityPayload(activity) });
  broadcaster.broadcast(event.event, event.data);
}

export function createTasksRouter({
  db,
  broadcaster = sse,
  captureTmuxOutput = captureTaskTmuxOutput,
  workQueuePath,
}: CreateTasksRouterOptions = {}) {
  const router = Router();
  const resolveDb = () => db ?? getDatabase();

  router.get("/", (request, response) => {
    syncWorkQueueToTasks(resolveDb(), { workQueuePath });

    const status = getTrimmedString(getSingleValue(request.query.status));
    const assignee = getTrimmedString(getSingleValue(request.query.assignee));
    const parentId = getTrimmedString(getSingleValue(request.query.parent_id));
    const plan = getOptionalQueryBoolean(request.query.plan);

    if (status && !TASK_STATUSES.has(status)) {
      sendBadRequest(response, "Invalid status filter.");
      return;
    }

    if (plan === null) {
      sendBadRequest(response, "Invalid plan filter.");
      return;
    }

    const tasks = listTaskSummaries(resolveDb(), {
      assignee,
      parentId,
      plan: plan ?? undefined,
      status,
    });

    response.json({ tasks: tasks.map(serializeTaskSummary) });
  });

  router.get("/:id", (request, response) => {
    const task = getTaskDetail(resolveDb(), request.params.id);

    if (!task) {
      sendNotFound(response);
      return;
    }

    response.json({ task });
  });

  router.get("/:id/tmux-output", async (request, response) => {
    syncWorkQueueToTasks(resolveDb(), { workQueuePath });

    const task = getTaskById(resolveDb(), request.params.id);

    if (!task) {
      sendNotFound(response);
      return;
    }

    const session = getTaskTmuxSession(task);

    if (!session) {
      response.status(404).json({ error: "Task has no tmux session." });
      return;
    }

    try {
      const output = await captureTmuxOutput(session, DEFAULT_TMUX_CAPTURE_LINES);

      response.json({
        capturedAt: Date.now(),
        output,
        session,
      });
    } catch {
      response.status(502).json({
        error: "Failed to capture tmux output.",
        session,
      });
    }
  });

  router.post("/", (request, response) => {
    const title = getTrimmedString(request.body?.title);

    if (!title) {
      sendBadRequest(response, "title is required.");
      return;
    }

    const status = getTrimmedString(request.body?.status) ?? "inbox";
    const priority = getTrimmedString(request.body?.priority) ?? "normal";
    const description = getOptionalString(request.body?.description);
    const assigneeAgentId = getOptionalString(request.body?.assignee_agent_id);
    const createdBy = getOptionalString(request.body?.created_by);
    const parentTaskId = getOptionalString(request.body?.parent_task_id);
    const metadata = request.body?.metadata;

    if (request.body?.parent_task_id !== undefined && parentTaskId === undefined) {
      sendBadRequest(response, "parent_task_id must be a string or null.");
      return;
    }

    if (!TASK_STATUSES.has(status)) {
      sendBadRequest(response, "Invalid status.");
      return;
    }

    if (!TASK_PRIORITIES.has(priority)) {
      sendBadRequest(response, "Invalid priority.");
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const database = resolveDb();

    if (parentTaskId && !getTaskById(database, parentTaskId)) {
      sendBadRequest(response, "Parent task not found.");
      return;
    }

    const result = runInTransaction(database, () => {
      const task = database
        .prepare(
          `INSERT INTO tasks (
             title,
             description,
             status,
             priority,
             assignee_agent_id,
             created_by,
             created_at,
             updated_at,
             completed_at,
             metadata,
             parent_task_id
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .get(
          title,
          description ?? null,
          status,
          priority,
          assigneeAgentId ?? null,
          createdBy ?? null,
          now,
          now,
          status === "done" ? now : null,
          metadata === undefined ? null : JSON.stringify(metadata),
          parentTaskId ?? null,
        ) as TaskRow;
      const activity = insertActivity(database, {
        agentId: createdBy ?? assigneeAgentId ?? null,
        message: `Created task "${title}".`,
        metadata: { status },
        taskId: task.id,
        type: "task_created",
      });

      return { activity, task: serializeTask(task) };
    });

    emitMutation(broadcaster, result.activity, {
      data: { task: toTaskPayload(result.task) },
      event: "task_created",
    });
    response.status(201).json({ task: result.task });
  });

  router.patch("/:id", (request, response) => {
    const database = resolveDb();
    const currentTask = getTaskById(database, request.params.id);

    if (!currentTask) {
      sendNotFound(response);
      return;
    }

    const updates: string[] = [];
    const values: Array<number | string | null> = [];

    const title = request.body?.title === undefined ? undefined : getTrimmedString(request.body.title);

    if (request.body?.title !== undefined && !title) {
      sendBadRequest(response, "title must be a non-empty string.");
      return;
    }

    const description = getOptionalString(request.body?.description);
    const assigneeAgentId = getOptionalString(request.body?.assignee_agent_id);
    const createdBy = getOptionalString(request.body?.created_by);
    const status = request.body?.status === undefined ? undefined : getTrimmedString(request.body.status);
    const priority = request.body?.priority === undefined ? undefined : getTrimmedString(request.body.priority);

    if (status !== undefined && !status) {
      sendBadRequest(response, "status must be a non-empty string.");
      return;
    }

    if (priority !== undefined && !priority) {
      sendBadRequest(response, "priority must be a non-empty string.");
      return;
    }

    if (status && !TASK_STATUSES.has(status)) {
      sendBadRequest(response, "Invalid status.");
      return;
    }

    if (priority && !TASK_PRIORITIES.has(priority)) {
      sendBadRequest(response, "Invalid priority.");
      return;
    }

    if (title !== undefined) {
      updates.push("title = ?");
      values.push(title);
    }

    if (request.body?.description !== undefined) {
      updates.push("description = ?");
      values.push(description ?? null);
    }

    if (status !== undefined) {
      updates.push("status = ?");
      values.push(status);

      updates.push("completed_at = ?");
      if (status === "done") {
        values.push(currentTask.completed_at ?? Math.floor(Date.now() / 1000));
      } else {
        values.push(null);
      }
    }

    if (priority !== undefined) {
      updates.push("priority = ?");
      values.push(priority);
    }

    if (request.body?.assignee_agent_id !== undefined) {
      updates.push("assignee_agent_id = ?");
      values.push(assigneeAgentId ?? null);
    }

    if (request.body?.created_by !== undefined) {
      updates.push("created_by = ?");
      values.push(createdBy ?? null);
    }

    if (request.body?.metadata !== undefined) {
      updates.push("metadata = ?");
      values.push(request.body.metadata === null ? null : JSON.stringify(request.body.metadata));
    }

    if (updates.length === 0) {
      sendBadRequest(response, "No valid fields provided.");
      return;
    }

    updates.push("updated_at = ?");
    values.push(Math.floor(Date.now() / 1000));
    values.push(currentTask.id);

    const result = runInTransaction(database, () => {
      const updatedTask = database
        .prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? RETURNING *`)
        .get(...values) as TaskRow;
      const task = serializeTask(updatedTask);

      const nextStatus = updatedTask.status;
      const nextAssignee = updatedTask.assignee_agent_id;
      const activityType =
        status !== undefined && nextStatus !== currentTask.status
          ? "task_status_changed"
          : request.body?.assignee_agent_id !== undefined && nextAssignee !== currentTask.assignee_agent_id
            ? "task_assigned"
            : "task_updated";
      const activityMessage =
        activityType === "task_status_changed"
          ? `Moved task "${updatedTask.title}" to ${nextStatus}.`
          : activityType === "task_assigned"
            ? nextAssignee
              ? `Assigned task "${updatedTask.title}" to ${nextAssignee}.`
              : `Cleared assignee for task "${updatedTask.title}".`
            : `Updated task "${updatedTask.title}".`;
      const activity = insertActivity(database, {
        agentId: createdBy ?? nextAssignee ?? currentTask.created_by,
        message: activityMessage,
        metadata: {
          assignee_agent_id: nextAssignee,
          priority: updatedTask.priority,
          status: nextStatus,
        },
        taskId: updatedTask.id,
        type: activityType,
      });

      return { activity, task };
    });

    emitMutation(broadcaster, result.activity, {
      data: { task: toTaskPayload(result.task) },
      event: "task_updated",
    });
    response.json({ task: result.task });
  });

  router.delete("/:id", (request, response) => {
    const database = resolveDb();
    const task = getTaskById(database, request.params.id);

    if (!task) {
      sendNotFound(response);
      return;
    }

    const result = runInTransaction(database, () => {
      database.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
      const activity = insertActivity(database, {
        agentId: task.assignee_agent_id ?? task.created_by,
        message: `Deleted task "${task.title}".`,
        taskId: task.id,
        type: "task_deleted",
      });

      return { activity, taskId: task.id };
    });

    emitMutation(broadcaster, result.activity, {
      data: { taskId: result.taskId },
      event: "task_deleted",
    });
    response.status(204).send();
  });

  router.post("/:id/comments", (request, response) => {
    const database = resolveDb();
    const task = getTaskById(database, request.params.id);

    if (!task) {
      sendNotFound(response);
      return;
    }

    const author = getTrimmedString(request.body?.author);
    const content = getTrimmedString(request.body?.content);
    const type = getTrimmedString(request.body?.type) ?? "comment";

    if (!author) {
      sendBadRequest(response, "author is required.");
      return;
    }

    if (!content) {
      sendBadRequest(response, "content is required.");
      return;
    }

    if (!COMMENT_TYPES.has(type)) {
      sendBadRequest(response, "Invalid comment type.");
      return;
    }

    const result = runInTransaction(database, () => {
      const comment = database
        .prepare(
          `INSERT INTO comments (task_id, author, content, type, created_at)
           VALUES (?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .get(task.id, author, content, type, Math.floor(Date.now() / 1000)) as CommentRow;
      const activity = insertActivity(database, {
        agentId: author,
        message: `${author} commented on "${task.title}".`,
        metadata: { comment_id: comment.id, comment_type: type },
        taskId: task.id,
        type: "message_sent",
      });

      return { activity, comment: serializeComment(comment) };
    });

    emitMutation(broadcaster, result.activity, {
      data: {
        comment: toCommentPayload(result.comment),
        taskId: task.id,
      },
      event: "comment_added",
    });
    response.status(201).json({ comment: result.comment });
  });

  router.post("/:id/subtasks", (request, response) => {
    const database = resolveDb();
    const task = getTaskById(database, request.params.id);

    if (!task) {
      sendNotFound(response);
      return;
    }

    const title = getTrimmedString(request.body?.title);

    if (!title) {
      sendBadRequest(response, "title is required.");
      return;
    }

    const status = getTrimmedString(request.body?.status) ?? "pending";
    const done = getOptionalBoolean(request.body?.done);
    const assigneeAgentId = getOptionalString(request.body?.assignee_agent_id);
    const blockedReason = getOptionalString(request.body?.blocked_reason);
    const sortOrder = getOptionalInteger(request.body?.sort_order) ?? 0;

    if (!SUBTASK_STATUSES.has(status)) {
      sendBadRequest(response, "Invalid subtask status.");
      return;
    }

    if (done !== undefined && done !== (status === "done")) {
      sendBadRequest(response, "done must match status.");
      return;
    }

    const finalDone = done ?? status === "done";
    const doneAt = finalDone ? Math.floor(Date.now() / 1000) : null;

    const result = runInTransaction(database, () => {
      const subtask = database
        .prepare(
          `INSERT INTO subtasks (
             task_id,
             title,
             done,
             done_at,
             assignee_agent_id,
             status,
             blocked_reason,
             sort_order
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .get(
          task.id,
          title,
          Number(finalDone),
          doneAt,
          assigneeAgentId ?? null,
          status,
          blockedReason ?? null,
          sortOrder,
        ) as SubtaskRow;
      database.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(Math.floor(Date.now() / 1000), task.id);
      const updatedTask = getTaskDetail(database, task.id);

      if (!updatedTask) {
        throw new Error("Task not found after subtask insert.");
      }

      const activity = insertActivity(database, {
        agentId: assigneeAgentId ?? task.assignee_agent_id ?? task.created_by,
        message: `Added subtask "${title}" to "${task.title}".`,
        metadata: { subtask_id: subtask.id, subtask_status: status },
        taskId: task.id,
        type: "task_updated",
      });

      return { activity, subtask: serializeSubtask(subtask), task: updatedTask };
    });

    emitMutation(broadcaster, result.activity, {
      data: { task: toTaskPayload(result.task) },
      event: "task_updated",
    });
    response.status(201).json({ subtask: result.subtask });
  });

  router.patch("/:id/subtasks/:sid", (request, response) => {
    const database = resolveDb();
    const task = getTaskById(database, request.params.id);

    if (!task) {
      sendNotFound(response);
      return;
    }

    const currentSubtask = getSubtaskById(database, task.id, request.params.sid);

    if (!currentSubtask) {
      response.status(404).json({ error: "Subtask not found." });
      return;
    }

    const updates: string[] = [];
    const values: Array<number | string | null> = [];
    const title = request.body?.title === undefined ? undefined : getTrimmedString(request.body.title);

    if (request.body?.title !== undefined && !title) {
      sendBadRequest(response, "title must be a non-empty string.");
      return;
    }

    const status = request.body?.status === undefined ? undefined : getTrimmedString(request.body.status);
    const done = getOptionalBoolean(request.body?.done);
    const blockedReason = getOptionalString(request.body?.blocked_reason);
    const assigneeAgentId = getOptionalString(request.body?.assignee_agent_id);
    const sortOrder = getOptionalInteger(request.body?.sort_order);

    if (status !== undefined && !status) {
      sendBadRequest(response, "status must be a non-empty string.");
      return;
    }

    if (status && !SUBTASK_STATUSES.has(status)) {
      sendBadRequest(response, "Invalid subtask status.");
      return;
    }

    const nextStatus =
      status ?? (done === undefined ? currentSubtask.status : done ? "done" : currentSubtask.status === "done" ? "pending" : currentSubtask.status);
    const nextDone = done ?? nextStatus === "done";

    if (done !== undefined && nextDone !== (nextStatus === "done")) {
      sendBadRequest(response, "done must match status.");
      return;
    }

    if (title !== undefined) {
      updates.push("title = ?");
      values.push(title);
    }

    if (status !== undefined || done !== undefined) {
      updates.push("status = ?");
      values.push(nextStatus);

      updates.push("done = ?");
      values.push(Number(nextDone));

      updates.push("done_at = ?");
      values.push(nextDone ? currentSubtask.done_at ?? Math.floor(Date.now() / 1000) : null);
    }

    if (request.body?.blocked_reason !== undefined) {
      updates.push("blocked_reason = ?");
      values.push(blockedReason ?? null);
    }

    if (request.body?.assignee_agent_id !== undefined) {
      updates.push("assignee_agent_id = ?");
      values.push(assigneeAgentId ?? null);
    }

    if (sortOrder !== undefined) {
      updates.push("sort_order = ?");
      values.push(sortOrder);
    }

    if (updates.length === 0) {
      sendBadRequest(response, "No valid fields provided.");
      return;
    }

    values.push(currentSubtask.id, task.id);

    const result = runInTransaction(database, () => {
      const subtask = database
        .prepare(`UPDATE subtasks SET ${updates.join(", ")} WHERE id = ? AND task_id = ? RETURNING *`)
        .get(...values) as SubtaskRow;
      database.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(Math.floor(Date.now() / 1000), task.id);
      const updatedTask = getTaskDetail(database, task.id);

      if (!updatedTask) {
        throw new Error("Task not found after subtask update.");
      }

      const activityType = !currentSubtask.done && subtask.done ? "subtask_completed" : "task_updated";
      const activity = insertActivity(database, {
        agentId: subtask.assignee_agent_id ?? task.assignee_agent_id ?? task.created_by,
        message:
          activityType === "subtask_completed"
            ? `Completed subtask "${subtask.title}" on "${task.title}".`
            : `Updated subtask "${subtask.title}" on "${task.title}".`,
        metadata: { subtask_id: subtask.id, subtask_status: subtask.status },
        taskId: task.id,
        type: activityType,
      });

      return { activity, subtask: serializeSubtask(subtask), task: updatedTask };
    });

    emitMutation(broadcaster, result.activity, {
      data: { task: toTaskPayload(result.task) },
      event: "task_updated",
    });
    response.json({ subtask: result.subtask });
  });

  return router;
}

export const tasksRouter = createTasksRouter();
