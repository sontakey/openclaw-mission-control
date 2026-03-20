import { Router } from "express";

import {
  getConfig as loadGatewayConfig,
  GATEWAY_TOKEN,
  GATEWAY_URL,
  listCrons as loadGatewayCrons,
} from "../gateway-client.js";

type CreateGatewayRouterOptions = {
  getConfig?: () => Promise<unknown>;
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

function normalizeCron(value: unknown, index: number): GatewayCron | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: getString(value, ["id", "key"]) ?? `cron-${index + 1}`,
    isActive: getBoolean(value, ["active", "enabled", "isActive", "is_active"]),
    lastRunAt: getTimestamp(value, ["lastRunAt", "last_run_at", "lastRun", "last_run"]),
    name:
      getString(value, ["name", "label", "task", "job", "command", "action"]) ??
      `Cron ${index + 1}`,
    nextRunAt: getTimestamp(value, ["nextRunAt", "next_run_at", "nextRun", "next_run"]),
    schedule: getString(value, ["schedule", "cron", "expression", "pattern"]) ?? "Unknown",
  };
}

export function createGatewayRouter({
  getConfig = loadGatewayConfig,
  listCrons = loadGatewayCrons,
}: CreateGatewayRouterOptions = {}) {
  const router = Router();

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
