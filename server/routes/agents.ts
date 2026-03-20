import { Router } from "express";

import { getConfig, listSessions } from "../gateway-client.js";

const DEFAULT_CACHE_TTL_MS = 30_000;

type AgentStatus = "online" | "offline";

type AgentSummary = {
  currentActivity: string | null;
  emoji: string;
  id: string;
  lastHeartbeat: number | null;
  name: string;
  role: string;
  sessionKey: string | null;
  status: AgentStatus;
};

type AgentConfig = {
  emoji: string;
  id: string;
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
  getConfig?: () => Promise<unknown>;
  listSessions?: () => Promise<unknown>;
  now?: () => number;
};

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

function getAgentConfigs(value: unknown) {
  const payload = unwrapGatewayPayload(value);

  if (!isRecord(payload) || !isRecord(payload.agents) || !Array.isArray(payload.agents.list)) {
    return [];
  }

  return payload.agents.list
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
        emoji: getString(item, ["emoji", "icon"]) ?? "",
        id,
        name: getString(item, ["name", "label"]) ?? id,
        role: getString(item, ["role", "workspace", "model"]) ?? "",
        sessionKey,
      };
    })
    .filter((item): item is AgentConfig => item !== null);
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

function normalizeSession(value: unknown): NormalizedSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const sessionKey = getString(value, ["sessionKey", "session_key", "key"]) ?? null;
  const nestedAgent = isRecord(value.agent) ? value.agent : null;
  const agentId =
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

function buildSnapshot(configValue: unknown, sessionsValue: unknown) {
  const sessions = getSessionList(sessionsValue)
    .map(normalizeSession)
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

  const agents = getAgentConfigs(configValue).map((agent) => {
    const agentSessions = sessionsByAgent.get(agent.id) ?? [];
    const primarySession = selectPrimarySession(agentSessions);

    return {
      currentActivity: primarySession?.currentActivity ?? null,
      emoji: agent.emoji,
      id: agent.id,
      lastHeartbeat: primarySession?.lastHeartbeat ?? null,
      name: agent.name,
      role: agent.role,
      sessionKey: primarySession?.sessionKey ?? agent.sessionKey,
      status: agentSessions.length > 0 ? "online" : "offline",
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
  getConfig: loadConfig = getConfig,
  listSessions: loadSessions = listSessions,
  now = Date.now,
}: CreateAgentsRouterOptions = {}) {
  const router = Router();
  let snapshot: AgentsSnapshot | null = null;

  async function getSnapshot() {
    const currentTime = now();

    if (snapshot && currentTime < snapshot.expiresAt) {
      return snapshot;
    }

    const [configValue, sessionsValue] = await Promise.all([loadConfig(), loadSessions()]);
    const nextSnapshot = buildSnapshot(configValue, sessionsValue);

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

  return router;
}

export const agentsRouter = createAgentsRouter();
