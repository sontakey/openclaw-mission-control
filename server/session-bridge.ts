import type { SseRecord } from "./sse.js";
import type { MissionControlDatabase } from "./db.js";
import { listSessions } from "./gateway-client.js";
import type { TaskSseBroadcaster } from "./routes/tasks.js";

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
  sessionKey?: string;
  source?: string;
};

type SessionStatus = "accepted" | "active" | "completed" | "error" | "failed" | "running";

type SessionRecord = Record<string, unknown> & {
  agentId?: string;
  agent_id?: string;
  kind?: string;
  label?: string;
  lastHeartbeat?: unknown;
  last_heartbeat?: unknown;
  sessionKey?: string;
  session_key?: string;
  status?: string;
  task?: string;
  updatedAt?: unknown;
  updated_at?: unknown;
};

type SyncResult = {
  completed: number;
  created: number;
  total_active: number;
  updated: number;
};

const SKIP_KINDS = new Set(["cron", "main", "heartbeat", "chat"]);
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const ORPHAN_GRACE_CYCLES = 3; // Must be missing for 3+ consecutive polls before marking done
const missingCounts = new Map<string, number>();

const SESSION_STATUS_MAP: Record<string, string> = {
  accepted: "assigned",
  active: "in_progress",
  completed: "done",
  error: "review",
  failed: "review",
  running: "in_progress",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function unwrapGatewayPayload(value: unknown): unknown {
  let current = value;
  for (let i = 0; i < 4; i++) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current) as unknown;
        continue;
      } catch {
        break;
      }
    }
    if (!isRecord(current)) break;
    if ("result" in current) {
      current = current.result;
      continue;
    }
    if (Array.isArray(current.content)) {
      const firstText = current.content.find(
        (item): item is { text: string } => isRecord(item) && typeof item.text === "string",
      )?.text;
      if (firstText) {
        current = firstText;
        continue;
      }
    }
    break;
  }
  return current;
}

function getSessionList(value: unknown): unknown[] {
  const payload = unwrapGatewayPayload(value);
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.sessions)) return payload.sessions;
  if (Array.isArray(payload.list)) return payload.list;
  return [];
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return normalizeTimestamp(n);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}

function getSessionKey(session: SessionRecord): string | undefined {
  return getString(session.sessionKey) ?? getString(session.session_key) ?? getString(session.key as string | undefined);
}

function getAgentId(session: SessionRecord): string | undefined {
  const direct = getString(session.agentId) ?? getString(session.agent_id);
  if (direct) return direct;

  const nested = isRecord(session.agent) ? session.agent : null;
  if (nested) {
    const id = getString(nested.id as string | undefined) ?? getString(nested.agentId as string | undefined);
    if (id) return id;
  }

  const key = getSessionKey(session);
  if (key?.startsWith("agent:")) {
    const parts = key.split(":");
    return parts.length >= 3 && parts[1] ? parts[1] : undefined;
  }
  return undefined;
}

function getSessionStatus(session: SessionRecord): string | undefined {
  return getString(session.status);
}

function getSessionKind(session: SessionRecord): string | undefined {
  // Try explicit kind field first
  const explicit = getString(session.kind);
  if (explicit) return explicit;

  // Derive kind from sessionKey pattern:
  // agent:<id>:subagent:<uuid> → subagent
  // agent:<id>:cron:<uuid> → cron
  // agent:<id>:telegram:... → chat
  // agent:<id>:main → main
  // agent:<id>:heartbeat → heartbeat
  const key = getSessionKey(session);
  if (!key) return undefined;

  const parts = key.split(":");
  if (parts.length < 3) return undefined;
  const segment = parts[2];
  if (segment === "subagent") return "subagent";
  if (segment === "cron") return "cron";
  if (segment === "main") return "main";
  if (segment === "heartbeat") return "heartbeat";
  if (segment === "telegram" || segment === "discord" || segment === "slack" || segment === "whatsapp" || segment === "signal") return "chat";
  return undefined;
}

function getSessionTimestamp(session: SessionRecord): number | null {
  for (const key of ["lastHeartbeat", "last_heartbeat", "updatedAt", "updated_at", "lastSeen", "last_seen", "createdAt", "created_at"]) {
    const ts = normalizeTimestamp(session[key]);
    if (ts !== null) return ts;
  }
  return null;
}

function mapSessionStatus(sessionStatus: string | undefined): string {
  if (!sessionStatus) return "in_progress";
  return SESSION_STATUS_MAP[sessionStatus.toLowerCase()] ?? "in_progress";
}

function deriveTitle(session: SessionRecord): string {
  const agentId = getAgentId(session);
  const task = getString(session.task);
  if (task) {
    const truncated = task.length > 100 ? task.slice(0, 97) + "..." : task;
    return agentId ? `${agentId}: ${truncated}` : truncated;
  }
  const label = getString(session.label);
  if (label) return agentId ? `${agentId}: ${label}` : label;

  const key = getSessionKey(session);
  const suffix = key ? key.split(":").pop() ?? key : "unknown";
  return agentId ? `${agentId}: ${suffix}` : suffix;
}

function listTasksBySessionKey(db: MissionControlDatabase): Map<string, TaskRow> {
  const tasks = db.prepare("SELECT * FROM tasks WHERE metadata IS NOT NULL").all() as TaskRow[];
  const map = new Map<string, TaskRow>();
  for (const task of tasks) {
    const parsed = parseJson(task.metadata);
    if (!isRecord(parsed)) continue;
    const meta = parsed as TaskMetadata;
    if (meta.source !== "session") continue;
    const key = getString(meta.sessionKey);
    if (key) map.set(key, task);
  }
  return map;
}

function deriveKindFromKey(key: string): string | undefined {
  const parts = key.split(":");
  if (parts.length < 3) return undefined;
  const segment = parts[2];
  if (segment === "subagent") return "subagent";
  if (segment === "cron") return "cron";
  if (segment === "main") return "main";
  if (segment === "heartbeat") return "heartbeat";
  if (segment === "telegram" || segment === "discord" || segment === "slack" || segment === "whatsapp" || segment === "signal") return "chat";
  return undefined;
}

export async function syncSessionsToTasks(
  db: MissionControlDatabase,
  broadcaster: TaskSseBroadcaster,
  fetchSessions: () => Promise<unknown> = () => listSessions(60),
): Promise<SyncResult> {
  const raw = await fetchSessions();
  const sessions = getSessionList(raw);
  const existingSessionTasks = listTasksBySessionKey(db);
  const now = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  const seenSessionKeys = new Set<string>();

  let created = 0;
  let updated = 0;
  let completed = 0;

  for (const rawSession of sessions) {
    if (!isRecord(rawSession)) continue;
    const session = rawSession as SessionRecord;

    const sessionKey = getSessionKey(session);
    if (!sessionKey) continue;

    // Derive kind from sessionKey pattern first, fall back to explicit field
    const kind = deriveKindFromKey(sessionKey) ?? getSessionKind(session);
    if (kind && SKIP_KINDS.has(kind)) continue;
    // Only allow subagent sessions on the board
    if (kind !== "subagent") continue;

    // Skip sessions older than 24 hours
    const ts = getSessionTimestamp(session);
    if (ts !== null && (nowMs - ts) > MAX_SESSION_AGE_MS) continue;

    seenSessionKeys.add(sessionKey);

    const sessionStatus = getSessionStatus(session);
    const taskStatus = mapSessionStatus(sessionStatus);
    const agentId = getAgentId(session) ?? null;
    const title = deriveTitle(session);
    const existing = existingSessionTasks.get(sessionKey);

    const metadata = {
      agentId,
      sessionKey,
      sessionKind: kind ?? "subagent",
      sessionStatus: sessionStatus ?? "unknown",
      source: "session",
      startedAt: ts,
    };

    if (!existing) {
      const task = db
        .prepare(
          `INSERT INTO tasks (title, description, status, priority, assignee_agent_id, created_at, updated_at, completed_at, metadata)
           VALUES (?, ?, ?, 'normal', ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .get(
          title,
          `Live session: ${sessionKey}`,
          taskStatus,
          agentId,
          now,
          now,
          taskStatus === "done" ? now : null,
          JSON.stringify(metadata),
        ) as TaskRow;

      broadcaster.broadcast("task_created", {
        task: JSON.parse(JSON.stringify({ ...task, metadata })) as Record<string, import("./sse.js").SseEventMap["task_created"]["task"] extends infer T ? T extends T ? T : never : never>,
      });
      created += 1;
      continue;
    }

    // Check if status changed
    const existingMeta = parseJson(existing.metadata);
    const existingSessionStatus = isRecord(existingMeta)
      ? getString((existingMeta as TaskMetadata).sessionStatus)
      : undefined;

    if (
      existing.status === taskStatus &&
      existingSessionStatus === (sessionStatus ?? "unknown") &&
      existing.title === title
    ) {
      continue;
    }

    const updatedTask = db
      .prepare(
        `UPDATE tasks SET title = ?, status = ?, assignee_agent_id = ?, completed_at = ?, metadata = ?, updated_at = ?
         WHERE id = ?
         RETURNING *`,
      )
      .get(
        title,
        taskStatus,
        agentId,
        taskStatus === "done" ? (existing.completed_at ?? now) : null,
        JSON.stringify(metadata),
        now,
        existing.id,
      ) as TaskRow;

    broadcaster.broadcast("task_updated", {
      task: JSON.parse(JSON.stringify({ ...updatedTask, metadata })) as Record<string, import("./sse.js").SseEventMap["task_created"]["task"] extends infer T ? T extends T ? T : never : never>,
    });

    if (taskStatus === "done") {
      completed += 1;
    } else {
      updated += 1;
    }
  }

  // Mark orphaned session tasks as done
  for (const [sessionKey, task] of existingSessionTasks) {
    if (seenSessionKeys.has(sessionKey)) continue;
    if (task.status === "done") continue;

    const metadata = parseJson(task.metadata);
    const updatedMeta = isRecord(metadata) ? { ...metadata, sessionStatus: "completed" } : { source: "session", sessionKey, sessionStatus: "completed" };

    const updatedTask = db
      .prepare(
        `UPDATE tasks SET status = 'done', completed_at = ?, metadata = ?, updated_at = ?
         WHERE id = ?
         RETURNING *`,
      )
      .get(
        task.completed_at ?? now,
        JSON.stringify(updatedMeta),
        now,
        task.id,
      ) as TaskRow;

    broadcaster.broadcast("task_updated", {
      task: JSON.parse(JSON.stringify({ ...updatedTask, metadata: updatedMeta })) as Record<string, import("./sse.js").SseEventMap["task_created"]["task"] extends infer T ? T extends T ? T : never : never>,
    });
    completed += 1;
  }

  return {
    completed,
    created,
    total_active: seenSessionKeys.size,
    updated,
  };
}
