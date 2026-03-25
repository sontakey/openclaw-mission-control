import { Router } from "express";

import { listSessions } from "../gateway-client.js";

const DEFAULT_CACHE_TTL_MS = 30_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const PERIOD_WINDOWS = [
  { label: "24h", windowMs: DAY_MS },
  { label: "3d", windowMs: 3 * DAY_MS },
  { label: "7d", windowMs: 7 * DAY_MS },
  { label: "30d", windowMs: 30 * DAY_MS },
] as const;

type UsageAgentSummary = {
  agentId: string;
  sessionCount: number;
  totalCost: number;
  totalTokens: number;
};

type UsagePeriod = {
  byAgent: UsageAgentSummary[];
  label: string;
  sessionCount: number;
  totalCost: number;
  totalTokens: number;
};

export type UsageResponse = {
  periods: UsagePeriod[];
  updatedAt: number;
};

type UsageSession = {
  agentId: string;
  estimatedCostUsd: number;
  totalTokens: number;
  updatedAt: number;
};

type UsageSnapshot = {
  data: UsageResponse;
  expiresAt: number;
};

type CreateUsageRouterOptions = {
  cacheTtlMs?: number;
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

function getAgentIdFromSessionKey(sessionKey: string) {
  if (!sessionKey.startsWith("agent:")) {
    return null;
  }

  const parts = sessionKey.split(":");
  return parts.length >= 3 && parts[1] ? parts[1] : null;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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

function normalizeSession(value: unknown): UsageSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const key = typeof value.key === "string" ? value.key : null;
  const agentId = key ? getAgentIdFromSessionKey(key) : null;
  const totalTokens = getNumber(value.totalTokens) ?? 0;
  const estimatedCostUsd = getNumber(value.estimatedCostUsd) ?? 0;
  const updatedAt = normalizeTimestamp(value.updatedAt);

  if (!agentId || updatedAt === null) {
    return null;
  }

  return {
    agentId,
    estimatedCostUsd,
    totalTokens,
    updatedAt,
  };
}

function buildUsageResponse(sessions: UsageSession[], now: number): UsageResponse {
  const periods = PERIOD_WINDOWS.map(({ label, windowMs }) => {
    const cutoff = now - windowMs;
    const byAgent = new Map<string, UsageAgentSummary>();

    let totalTokens = 0;
    let totalCost = 0;
    let sessionCount = 0;

    for (const session of sessions) {
      if (session.updatedAt < cutoff) {
        continue;
      }

      sessionCount += 1;
      totalTokens += session.totalTokens;
      totalCost += session.estimatedCostUsd;

      const existing = byAgent.get(session.agentId) ?? {
        agentId: session.agentId,
        sessionCount: 0,
        totalCost: 0,
        totalTokens: 0,
      };

      existing.sessionCount += 1;
      existing.totalTokens += session.totalTokens;
      existing.totalCost += session.estimatedCostUsd;
      byAgent.set(session.agentId, existing);
    }

    return {
      byAgent: Array.from(byAgent.values()).sort((left, right) => {
        if (right.totalTokens !== left.totalTokens) {
          return right.totalTokens - left.totalTokens;
        }

        return left.agentId.localeCompare(right.agentId);
      }),
      label,
      sessionCount,
      totalCost,
      totalTokens,
    } satisfies UsagePeriod;
  });

  return {
    periods,
    updatedAt: now,
  };
}

export function createUsageRouter({
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  listSessions: listSessionsImpl = listSessions,
  now = () => Date.now(),
}: CreateUsageRouterOptions = {}) {
  const router = Router();
  let cachedSnapshot: UsageSnapshot | null = null;

  router.get("/", async (_request, response) => {
    const currentTime = now();

    if (cachedSnapshot && cachedSnapshot.expiresAt > currentTime) {
      response.json(cachedSnapshot.data);
      return;
    }

    try {
      const sessionsPayload = await listSessionsImpl();
      const sessions = getSessionList(sessionsPayload)
        .map((session) => normalizeSession(session))
        .filter((session): session is UsageSession => session !== null);

      const data = buildUsageResponse(sessions, currentTime);

      cachedSnapshot = {
        data,
        expiresAt: currentTime + cacheTtlMs,
      };

      response.json(data);
    } catch (error) {
      response.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch usage data from gateway.",
      });
    }
  });

  return router;
}

export const usageRouter = createUsageRouter();
