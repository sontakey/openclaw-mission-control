import { Router } from "express";

import {
  getConfig as loadGatewayConfig,
  getHealth as loadGatewayHealth,
  GATEWAY_TOKEN,
  GATEWAY_URL,
  listCrons as loadGatewayCrons,
  type GatewayHealth,
} from "../gateway-client.js";

type CreateGatewayRouterOptions = {
  getConfig?: () => Promise<unknown>;
  getHealth?: () => Promise<GatewayHealth>;
  listCrons?: () => Promise<unknown>;
};

type GatewayCron = {
  id: string;
  isActive: boolean | null;
  lastRunAt: number | null;
  name: string;
  nextRunAt: number | null;
  schedule: string;
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

function getBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }
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

function getTimestamp(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const timestamp = normalizeTimestamp(record[key]);

    if (timestamp !== null) {
      return timestamp;
    }
  }

  return null;
}

function getCronList(value: unknown) {
  const payload = unwrapGatewayPayload(value);

  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  if (Array.isArray(payload.crons)) {
    return payload.crons;
  }

  if (Array.isArray(payload.jobs)) {
    return payload.jobs;
  }

  if (Array.isArray(payload.list)) {
    return payload.list;
  }

  return [];
}

function formatSchedule(schedule: unknown): string {
  if (typeof schedule === "string") {
    return schedule;
  }
  if (!isRecord(schedule)) {
    return "Unknown";
  }
  const kind = schedule.kind;
  if (kind === "cron" && typeof schedule.expr === "string") {
    return schedule.expr;
  }
  if (kind === "every" && typeof schedule.everyMs === "number") {
    const ms = schedule.everyMs as number;
    if (ms >= 86400000) return `Every ${Math.round(ms / 86400000)}d`;
    if (ms >= 3600000) return `Every ${Math.round(ms / 3600000)}h`;
    if (ms >= 60000) return `Every ${Math.round(ms / 60000)}m`;
    return `Every ${Math.round(ms / 1000)}s`;
  }
  if (kind === "at" && typeof schedule.at === "string") {
    return `Once at ${schedule.at}`;
  }
  return String(kind ?? "Unknown");
}

function normalizeCron(value: unknown, index: number): GatewayCron | null {
  if (!isRecord(value)) {
    return null;
  }

  // State may contain nextRunAtMs, lastRunAtMs
  const state = isRecord(value.state) ? value.state as Record<string, unknown> : {};

  return {
    id: getString(value, ["id", "key"]) ?? `cron-${index + 1}`,
    isActive: getBoolean(value, ["active", "enabled", "isActive", "is_active"]),
    lastRunAt: getTimestamp(state, ["lastRunAtMs", "lastRunAt"]) ?? getTimestamp(value, ["lastRunAt", "last_run_at"]),
    name:
      getString(value, ["name", "label", "task", "job", "command", "action"]) ??
      `Cron ${index + 1}`,
    nextRunAt: getTimestamp(state, ["nextRunAtMs", "nextRunAt"]) ?? getTimestamp(value, ["nextRunAt", "next_run_at"]),
    schedule: formatSchedule(value.schedule),
  };
}

export function createGatewayRouter({
  getConfig = loadGatewayConfig,
  getHealth = loadGatewayHealth,
  listCrons = loadGatewayCrons,
}: CreateGatewayRouterOptions = {}) {
  const router = Router();

  router.get("/health", async (_request, response) => {
    try {
      response.json(await getHealth());
    } catch {
      response.status(502).json({ error: "Failed to load gateway health." });
    }
  });

  router.get("/config", async (_request, response) => {
    try {
      const config = unwrapGatewayPayload(await getConfig());

      response.json({
        config,
        connection: {
          hasToken: Boolean(GATEWAY_TOKEN),
          status: "connected",
          url: GATEWAY_URL,
        },
      });
    } catch {
      response.status(502).json({ error: "Failed to load gateway config." });
    }
  });

  router.get("/crons", async (_request, response) => {
    try {
      const crons = getCronList(await listCrons())
        .map(normalizeCron)
        .filter((cron): cron is GatewayCron => cron !== null);

      response.json({ crons });
    } catch {
      response.status(502).json({ error: "Failed to load gateway cron jobs." });
    }
  });

  return router;
}

export const gatewayRouter = createGatewayRouter();
