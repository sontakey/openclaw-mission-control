import { Router } from "express";

import type { MissionControlDatabase } from "../db.js";
import { getDatabase } from "../db.js";
import { getConfig, listSessions } from "../gateway-client.js";

const DEFAULT_CACHE_TTL_MS = 30_000;
const ONLINE_THRESHOLD_MS = 30 * 60 * 1000;

type AgentStatus = "online" | "offline";

type AgentSummary = {
  children: string[];
  currentActivity: string | null;
  currentTask: { id: string; title: string; status: string } | null;
  delegatesTo: string[];
  emoji: string;
  id: string;
  lastHeartbeat: number | null;
  name: string;
  parentId: string | null;
  role: string;
  sessionKey: string | null;
  status: AgentStatus;
};

type AgentConfig = {
  delegatesTo: string[];
  emoji: string;
  id: string;
  isDefault: boolean;
  name: string;
  role: string;
  sessionKey: string | null;
};

type NormalizedSession = {
  agentId: string | null;
  currentActivity: string | null;
  lastHeartbeat: number | null;
  sessionKey: string | null;
  source: Record<string, unknown>;
};

type AgentsSnapshot = {
  agents: AgentSummary[];
  expiresAt: number;
  sessions: NormalizedSession[];
};

type CreateAgentsRouterOptions = {
  cacheTtlMs?: number;
  db?: MissionControlDatabase;
  getConfig?: () => Promise<unknown>;
  listSessions?: () => Promise<unknown>;
  now?: () => number;
};

type TaskSummaryRow = {
  assignee_agent_id: string | null;
  child_count: number;
  completed_at: number | null;
  completed_child_count: number;
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

type ActivityRow = {
  agent_id: string | null;
  created_at: number;
  id: string;
  message: string;
  metadata: string | null;
  task_id: string | null;
  type: string;
};

const TASK_SUMMARY_SELECT = `
  SELECT
    tasks.*,
    COUNT(child_tasks.id) AS child_count,
    COALESCE(SUM(CASE WHEN child_tasks.status = 'done' THEN 1 ELSE 0 END), 0) AS completed_child_count
  FROM tasks
  LEFT JOIN tasks AS child_tasks ON child_tasks.parent_task_id = tasks.id
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function unwrapGatewayPayload(value: unknown) {
  let current = value;

  for (let index = 0; index < 4; index += 1) {
    const parsed = parseJson(current);

    if (parsed !== current) {
      current = parsed;
      continue;
    }

    if (!isRecord(current)) {
      break;
    }

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

  return parseJson(current);
}

function getString(record: Record<string, unknown>, keys: string[]) {
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

  return undefined;
}

function getBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value !== "string") {
      continue;
    }

    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === "true") {
      return true;
    }

    if (normalizedValue === "false") {
      return false;
    }
  }

  return false;
}

function getStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const values: string[] = [];
  const seenValues = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmedItem = item.trim();

    if (trimmedItem.length === 0 || seenValues.has(trimmedItem)) {
      continue;
    }

    seenValues.add(trimmedItem);
    values.push(trimmedItem);
  }

  return values;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "string") {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
      return normalizeTimestamp(numericValue);
    }

    const parsedValue = Date.parse(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}

function getTimestamp(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const timestamp = normalizeTimestamp(record[key]);

    if (timestamp !== null) {
      return timestamp;
    }
  }

  return null;
}

function getAgentIdFromSessionKey(sessionKey: string | null) {
  if (!sessionKey || !sessionKey.startsWith("agent:")) {
    return null;
  }

  const parts = sessionKey.split(":");
  return parts.length >= 3 && parts[1] ? parts[1] : null;
}

function getAgentIdFromSessionLabel(label: string | null, knownAgentIds: ReadonlySet<string>) {
  if (!label) {
    return null;
  }

  const normalizedLabel = label.trim().toLowerCase();

  for (const agentId of knownAgentIds) {
    const normalizedAgentId = agentId.toLowerCase();

    if (normalizedLabel === normalizedAgentId || normalizedLabel.startsWith(`${normalizedAgentId}-`)) {
      return agentId;
    }
  }

  return null;
}

function deriveStatusFromHeartbeat(lastHeartbeat: number | null, currentTime: number) {
  if (!lastHeartbeat || currentTime - lastHeartbeat > ONLINE_THRESHOLD_MS) {
    return "offline" satisfies AgentStatus;
  }

  return "online" satisfies AgentStatus;
}

// Default emoji palette for agents without configured emojis
// Cycles through these based on agent name hash — no hardcoded agent IDs
const DEFAULT_EMOJI_PALETTE = ["🤖", "🔧", "📢", "🧪", "🖥️", "📝", "⚖️", "💰", "🔬", "🗣️", "🎯", "🎨", "📊", "🔍"];

function getDefaultEmoji(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return DEFAULT_EMOJI_PALETTE[Math.abs(hash) % DEFAULT_EMOJI_PALETTE.length] ?? "🤖";
}

function deriveAgentRole(id: string, item: Record<string, unknown>): string {
  // Try identity.role or role field from config
  const identity = item.identity;
  if (isRecord(identity)) {
    const role = (identity as Record<string, unknown>).role;
    if (typeof role === "string" && role.trim()) {
      return role.trim();
    }
  }
  // Fall back to model.primary
  const model = item.model;
  if (isRecord(model)) {
    const primary = (model as Record<string, unknown>).primary;
    if (typeof primary === "string") {
      return primary;
    }
  }
  if (typeof item.model === "string") {
    return item.model;
  }
  return id;
}

function getDelegatesTo(item: Record<string, unknown>) {
  const subagents =
    (isRecord(item.subagents) ? item.subagents : null) ??
    (isRecord(item.sub_agents) ? item.sub_agents : null);

  if (!subagents) {
    return [];
  }

  return getStringList(subagents.allowAgents ?? subagents.allow_agents);
}

function getAgentConfigs(value: unknown) {
  // The gateway config.get response nests agents at multiple possible paths
  const payload = unwrapGatewayPayload(value);

  // Try multiple paths where agents.list might live
  let agentsList: unknown[] | null = null;
  
  if (isRecord(payload)) {
    // Direct: payload.agents.list
    if (isRecord(payload.agents) && Array.isArray((payload.agents as Record<string, unknown>).list)) {
      agentsList = (payload.agents as Record<string, unknown>).list as unknown[];
    }
    // Nested: payload.result.config.agents.list (gateway config.get response)
    else if (isRecord(payload.result)) {
      const result = payload.result as Record<string, unknown>;
      const config = (isRecord(result.config) ? result.config : result) as Record<string, unknown>;
      if (isRecord(config.agents) && Array.isArray((config.agents as Record<string, unknown>).list)) {
        agentsList = (config.agents as Record<string, unknown>).list as unknown[];
      }
    }
    // Nested: payload.config.agents.list
    else if (isRecord(payload.config)) {
      const config = payload.config as Record<string, unknown>;
      if (isRecord(config.agents) && Array.isArray((config.agents as Record<string, unknown>).list)) {
        agentsList = (config.agents as Record<string, unknown>).list as unknown[];
      }
    }
  }
  
  if (!agentsList) {
    return [];
  }

  const agentConfigs = agentsList
    .map((item): AgentConfig | null => {
      if (!isRecord(item)) {
        return null;
      }

      const sessionKey = getString(item, ["sessionKey", "session_key", "mainSessionKey"]) ?? null;
      const id = getString(item, ["id", "agentId", "agent_id"]) ?? getAgentIdFromSessionKey(sessionKey);

      if (!id) {
        return null;
      }

      return {
        delegatesTo: getDelegatesTo(item),
        emoji: (() => {
        const cfgEmoji = getString(item, ["emoji", "icon"]);
        if (cfgEmoji) return cfgEmoji;
        const identity = item.identity;
        if (isRecord(identity)) {
          const idEmoji = getString(identity as Record<string, unknown>, ["emoji"]);
          if (idEmoji) return idEmoji;
        }
        return getDefaultEmoji(id ?? "agent");
      })(),
        id,
        isDefault: getBoolean(item, ["default", "isDefault", "is_default"]),
        name: getString(item, ["name", "label"]) ?? id,
        role: getString(item, ["role"]) ?? deriveAgentRole(id, item),
        sessionKey,
      };
    })
    .filter((item): item is AgentConfig => item !== null);

  const agentIds = new Set(agentConfigs.map((agent) => agent.id));

  return agentConfigs.map((agent) => ({
    ...agent,
    delegatesTo: agent.delegatesTo.filter((delegateId) => delegateId !== agent.id && agentIds.has(delegateId)),
  }));
}

function getSessionList(value: unknown) {
  const payload = unwrapGatewayPayload(value);

  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  if (Array.isArray(payload.sessions)) {
    return payload.sessions;
  }

  if (Array.isArray(payload.list)) {
    return payload.list;
  }

  return [];
}

function normalizeSession(value: unknown, knownAgentIds: ReadonlySet<string>): NormalizedSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const sessionKey = getString(value, ["sessionKey", "session_key", "key"]) ?? null;
  const label = getString(value, ["label", "name", "title"]) ?? null;
  const nestedAgent = isRecord(value.agent) ? value.agent : null;
  const agentIdFromLabel = getAgentIdFromSessionLabel(label, knownAgentIds);
  const agentId =
    agentIdFromLabel ??
    getString(value, ["agentId", "agent_id"]) ??
    (nestedAgent ? getString(nestedAgent, ["id", "agentId", "agent_id"]) : undefined) ??
    getAgentIdFromSessionKey(sessionKey);

  return {
    agentId: agentId ?? null,
    currentActivity:
      getString(value, [
        "currentActivity",
        "current_activity",
        "activity",
        "statusMessage",
        "status_message",
      ]) ?? null,
    lastHeartbeat: getTimestamp(value, [
      "lastHeartbeat",
      "last_heartbeat",
      "lastSeen",
      "last_seen",
      "lastActivity",
      "last_activity",
      "updatedAt",
      "updated_at",
    ]),
    sessionKey,
    source: value,
  };
}

function selectPrimarySession(sessions: NormalizedSession[]) {
  let primarySession: NormalizedSession | null = null;

  for (const session of sessions) {
    if (!primarySession) {
      primarySession = session;
      continue;
    }

    const primaryTimestamp = primarySession.lastHeartbeat ?? 0;
    const sessionTimestamp = session.lastHeartbeat ?? 0;

    if (sessionTimestamp > primaryTimestamp) {
      primarySession = session;
    }
  }

  return primarySession;
}

function serializeTaskSummary(task: TaskSummaryRow) {
  const { child_count, completed_child_count, metadata, ...taskRow } = task;
  const childCount = Number(child_count);

  return {
    ...taskRow,
    child_count: childCount,
    completion_stats: {
      completed: Number(completed_child_count),
      total: childCount,
    },
    metadata: parseJson(metadata),
  };
}

function serializeActivity(activity: ActivityRow) {
  return {
    ...activity,
    metadata: parseJson(activity.metadata),
  };
}

function listAgentTasks(db: MissionControlDatabase, agentId: string) {
  return db
    .prepare(
      `${TASK_SUMMARY_SELECT}
       WHERE tasks.assignee_agent_id = ?
       GROUP BY tasks.id
       ORDER BY
         CASE tasks.status
           WHEN 'in_progress' THEN 0
           WHEN 'review' THEN 1
           WHEN 'assigned' THEN 2
           WHEN 'inbox' THEN 3
           ELSE 4
         END,
         tasks.updated_at DESC,
         tasks.created_at DESC,
         tasks.id DESC`,
    )
    .all(agentId) as TaskSummaryRow[];
}

function listAgentActivities(db: MissionControlDatabase, agentId: string) {
  return db
    .prepare(
      `SELECT * FROM activities
       WHERE agent_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 25`,
    )
    .all(agentId) as ActivityRow[];
}

type AgentHierarchy = {
  childrenByAgent: Map<string, string[]>;
  parentByAgent: Map<string, string | null>;
};

function buildAgentHierarchy(agents: AgentConfig[]): AgentHierarchy {
  // Simple hierarchy: the default agent is root, everyone else is a direct child.
  // The allowAgents (delegatesTo) data is a spawn-permission model, NOT a reporting hierarchy.
  // An agent that can spawn another agent doesn't mean that agent reports to them.
  const childrenByAgent = new Map<string, string[]>();
  const parentByAgent = new Map<string, string | null>();
  
  const rootId = agents.find((agent) => agent.isDefault)?.id ?? agents[0]?.id ?? null;
  const rootChildren: string[] = [];

  for (const agent of agents) {
    childrenByAgent.set(agent.id, []);
    
    if (agent.id === rootId) {
      parentByAgent.set(agent.id, null);
    } else {
      parentByAgent.set(agent.id, rootId);
      rootChildren.push(agent.id);
    }
  }

  if (rootId) {
    childrenByAgent.set(rootId, rootChildren);
  }

  return {
    childrenByAgent,
    parentByAgent,
  };
}

function buildSnapshot(
  configValue: unknown,
  sessionsValue: unknown,
  db: MissionControlDatabase,
  currentTime: number,
) {
  const agentConfigs = getAgentConfigs(configValue);
  const hierarchy = buildAgentHierarchy(agentConfigs);
  const knownAgentIds = new Set(agentConfigs.map((agent) => agent.id));
  const sessions = getSessionList(sessionsValue)
    .map((session) => normalizeSession(session, knownAgentIds))
    .filter((session): session is NormalizedSession => session !== null);
  const sessionsByAgent = new Map<string, NormalizedSession[]>();

  for (const session of sessions) {
    if (!session.agentId) {
      continue;
    }

    const agentSessions = sessionsByAgent.get(session.agentId) ?? [];
    agentSessions.push(session);
    sessionsByAgent.set(session.agentId, agentSessions);
  }

  // Cross-reference local tasks DB to find current task per agent
  const activeTasksByAgent = new Map<string, { id: string; title: string; status: string }>();
  try {
    const activeTasks = db.prepare(
      `SELECT id, title, status, assignee_agent_id FROM tasks 
       WHERE status IN ('in_progress', 'assigned', 'review') 
       AND assignee_agent_id IS NOT NULL
       ORDER BY CASE status WHEN 'in_progress' THEN 1 WHEN 'review' THEN 2 WHEN 'assigned' THEN 3 END`
    ).all() as Array<{ id: string; title: string; status: string; assignee_agent_id: string }>;
    
    for (const task of activeTasks) {
      if (!activeTasksByAgent.has(task.assignee_agent_id)) {
        activeTasksByAgent.set(task.assignee_agent_id, {
          id: task.id,
          title: task.title,
          status: task.status,
        });
      }
    }
  } catch {
    // DB not available, skip task lookup
  }

  const agents = agentConfigs.map((agent) => {
    const agentSessions = sessionsByAgent.get(agent.id) ?? [];
    const primarySession = selectPrimarySession(agentSessions);
    const currentTask = activeTasksByAgent.get(agent.id) ?? null;
    const heartbeatStatus = deriveStatusFromHeartbeat(primarySession?.lastHeartbeat ?? null, currentTime);
    const status: AgentStatus = currentTask?.status === "in_progress" ? "online" : heartbeatStatus;

    return {
      children: [...(hierarchy.childrenByAgent.get(agent.id) ?? [])],
      currentActivity: primarySession?.currentActivity ?? null,
      currentTask,
      delegatesTo: [...agent.delegatesTo],
      emoji: agent.emoji,
      id: agent.id,
      lastHeartbeat: primarySession?.lastHeartbeat ?? null,
      name: agent.name,
      parentId: hierarchy.parentByAgent.get(agent.id) ?? null,
      role: agent.role,
      sessionKey: primarySession?.sessionKey ?? agent.sessionKey,
      status,
    } satisfies AgentSummary;
  });

  return {
    agents,
    sessions,
  };
}

function serializeSession(session: NormalizedSession) {
  return {
    ...session.source,
    agentId: session.agentId,
    currentActivity: session.currentActivity,
    lastHeartbeat: session.lastHeartbeat,
    sessionKey: session.sessionKey,
  };
}

export function createAgentsRouter({
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  db,
  getConfig: loadConfig = getConfig,
  listSessions: loadSessions = listSessions,
  now = Date.now,
}: CreateAgentsRouterOptions = {}) {
  const router = Router();
  let snapshot: AgentsSnapshot | null = null;
  const resolveDb = () => db ?? getDatabase();

  async function getSnapshot() {
    const currentTime = now();

    if (snapshot && currentTime < snapshot.expiresAt) {
      return snapshot;
    }

    const [configValue, sessionsValue] = await Promise.all([loadConfig(), loadSessions()]);
    const nextSnapshot = buildSnapshot(configValue, sessionsValue, resolveDb(), currentTime);

    snapshot = {
      ...nextSnapshot,
      expiresAt: currentTime + cacheTtlMs,
    };

    return snapshot;
  }

  router.get("/", async (_request, response) => {
    try {
      const cachedSnapshot = await getSnapshot();
      response.json(cachedSnapshot.agents);
    } catch {
      response.status(502).json({ error: "Failed to load agents." });
    }
  });

  router.get("/:id/sessions", async (request, response) => {
    try {
      const cachedSnapshot = await getSnapshot();
      const sessions = cachedSnapshot.sessions
        .filter((session) => session.agentId === request.params.id)
        .map(serializeSession);

      response.json(sessions);
    } catch {
      response.status(502).json({ error: "Failed to load agent sessions." });
    }
  });

  router.get("/:id/detail", async (request, response) => {
    try {
      const cachedSnapshot = await getSnapshot();
      const agent = cachedSnapshot.agents.find((candidate) => candidate.id === request.params.id);

      if (!agent) {
        response.status(404).json({ error: "Agent not found." });
        return;
      }

      const sessions = cachedSnapshot.sessions
        .filter((session) => session.agentId === request.params.id)
        .map(serializeSession);
      const tasks = listAgentTasks(resolveDb(), request.params.id).map(serializeTaskSummary);
      const activities = listAgentActivities(resolveDb(), request.params.id).map(serializeActivity);

      response.json({
        activities,
        sessions,
        tasks,
      });
    } catch {
      response.status(502).json({ error: "Failed to load agent detail." });
    }
  });

  return router;
}

export const agentsRouter = createAgentsRouter();
