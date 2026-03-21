import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { MissionControlDatabase } from "./db.js";

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

type TaskMetadata = Record<string, unknown> & {
  work_queue_id?: unknown;
};

type WorkQueueItem = {
  assigneeAgentId: string | null;
  completedAt: number | null;
  description: string;
  metadata: Record<string, unknown>;
  status: "assigned" | "done" | "in_progress" | "review";
  title: string;
  workQueueId: string;
};

const DEFAULT_WORK_QUEUE_LOCATION = "~/.openclaw/workspace-anton/agent-work-queue.json";
const WORK_QUEUE_STATUSES = new Map<string, WorkQueueItem["status"]>([
  ["completed", "done"],
  ["failed", "review"],
  ["pending", "assigned"],
  ["running", "in_progress"],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTaskMetadata(metadata: string | null) {
  if (!metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata) as unknown;
    return isRecord(parsed) ? (parsed as TaskMetadata) : null;
  } catch {
    return null;
  }
}

function parseTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }

  const asString = getString(value);

  if (!asString) {
    return null;
  }

  if (/^\d+$/.test(asString)) {
    return parseTimestamp(Number(asString));
  }

  const parsed = Date.parse(asString);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

function resolveWorkQueuePath(workQueuePath?: string | null) {
  if (workQueuePath === null) {
    return null;
  }

  const configuredPath = getString(workQueuePath) ?? process.env.WORK_QUEUE_PATH ?? DEFAULT_WORK_QUEUE_LOCATION;

  return configuredPath.startsWith("~/")
    ? resolve(homedir(), configuredPath.slice(2))
    : resolve(configuredPath);
}

function getWorkQueueEntries(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (!isRecord(raw)) {
    return [];
  }

  for (const key of ["items", "queue", "work_queue", "workQueue", "entries"]) {
    const candidate = raw[key];

    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return Object.entries(raw).flatMap(([key, value]) =>
    isRecord(value) ? [{ source_key: key, ...value }] : [],
  );
}

function buildDescription(item: Record<string, unknown>) {
  const lines = ["Synced from agent-work-queue.json."];
  const fieldLabels = [
    ["harness", "Harness"],
    ["model", "Model"],
    ["loop_manager", "Loop Manager"],
    ["tmux_session", "Tmux Session"],
    ["deploy_url", "Deploy URL"],
  ] as const;

  for (const [field, label] of fieldLabels) {
    const value = getString(item[field]);

    if (value) {
      lines.push(`${label}: ${value}`);
    }
  }

  return lines.join("\n");
}

function normalizeWorkQueueItem(raw: unknown): WorkQueueItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const workQueueId =
    getString(raw.id) ??
    getString(raw.work_queue_id) ??
    getString(raw.queue_id) ??
    getString(raw.task_id) ??
    getString(raw.source_key);

  if (!workQueueId) {
    return null;
  }

  const status = WORK_QUEUE_STATUSES.get(getString(raw.status)?.toLowerCase() ?? "") ?? "assigned";

  return {
    assigneeAgentId: getString(raw.owner_agent) ?? getString(raw.ownerAgent) ?? null,
    completedAt: status === "done" ? parseTimestamp(raw.completed_at) ?? Math.floor(Date.now() / 1000) : null,
    description: buildDescription(raw),
    metadata: {
      source: "agent-work-queue",
      work_queue: raw,
      work_queue_id: workQueueId,
    },
    status,
    title: getString(raw.name) ?? getString(raw.title) ?? workQueueId,
    workQueueId,
  };
}

function listTasksByWorkQueueId(db: MissionControlDatabase) {
  const tasks = db.prepare("SELECT * FROM tasks WHERE metadata IS NOT NULL").all() as TaskRow[];
  const tasksByWorkQueueId = new Map<string, TaskRow>();

  for (const task of tasks) {
    const metadata = parseTaskMetadata(task.metadata);
    const workQueueId = getString(metadata?.work_queue_id);

    if (workQueueId) {
      tasksByWorkQueueId.set(workQueueId, task);
    }
  }

  return tasksByWorkQueueId;
}

export function syncWorkQueueToTasks(
  db: MissionControlDatabase,
  { workQueuePath }: { workQueuePath?: string | null } = {},
) {
  const resolvedPath = resolveWorkQueuePath(workQueuePath);

  if (!resolvedPath || !existsSync(resolvedPath)) {
    return { created: 0, updated: 0 };
  }

  let rawWorkQueue: unknown;

  try {
    rawWorkQueue = JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
  } catch (error) {
    console.warn(`Unable to read work queue from ${resolvedPath}:`, error);
    return { created: 0, updated: 0 };
  }

  const workQueueItems = getWorkQueueEntries(rawWorkQueue)
    .map(normalizeWorkQueueItem)
    .filter((item): item is WorkQueueItem => item !== null);

  if (workQueueItems.length === 0) {
    return { created: 0, updated: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const existingTasks = listTasksByWorkQueueId(db);
  let created = 0;
  let updated = 0;

  for (const item of workQueueItems) {
    const metadataJson = JSON.stringify(item.metadata);
    const currentTask = existingTasks.get(item.workQueueId);

    if (!currentTask) {
      const createdTask = db
        .prepare(
          `INSERT INTO tasks (
             title,
             description,
             status,
             priority,
             assignee_agent_id,
             created_at,
             updated_at,
             completed_at,
             metadata
           )
           VALUES (?, ?, ?, 'normal', ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .get(
          item.title,
          item.description,
          item.status,
          item.assigneeAgentId,
          now,
          now,
          item.completedAt,
          metadataJson,
        ) as TaskRow;

      existingTasks.set(item.workQueueId, createdTask);
      created += 1;
      continue;
    }

    if (
      currentTask.assignee_agent_id === item.assigneeAgentId &&
      currentTask.completed_at === item.completedAt &&
      currentTask.description === item.description &&
      currentTask.metadata === metadataJson &&
      currentTask.status === item.status &&
      currentTask.title === item.title
    ) {
      continue;
    }

    const updatedTask = db
      .prepare(
        `UPDATE tasks
         SET title = ?,
             description = ?,
             status = ?,
             assignee_agent_id = ?,
             completed_at = ?,
             metadata = ?,
             updated_at = ?
         WHERE id = ?
         RETURNING *`,
      )
      .get(
        item.title,
        item.description,
        item.status,
        item.assigneeAgentId,
        item.completedAt,
        metadataJson,
        now,
        currentTask.id,
      ) as TaskRow;

    existingTasks.set(item.workQueueId, updatedTask);
    updated += 1;
  }

  return { created, updated };
}
