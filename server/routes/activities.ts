import { Router } from "express";
import type { Response } from "express";

import type { MissionControlDatabase } from "../db.js";
import { getDatabase } from "../db.js";
import { sse } from "../sse.js";
import type { SseClient } from "../sse.js";

type ActivityRow = {
  agent_id: string | null;
  created_at: number;
  id: string;
  message: string;
  metadata: string | null;
  task_id: string | null;
  type: string;
};

export type ActivitiesSseBroadcaster = {
  addClient(client: SseClient): void;
  removeClient(client: SseClient): void;
};

type CreateActivitiesRouterOptions = {
  broadcaster?: ActivitiesSseBroadcaster;
  db?: MissionControlDatabase;
  defaultLimit?: number;
};

function getSingleValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
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

function serializeActivity(activity: ActivityRow) {
  return {
    ...activity,
    metadata: parseJson(activity.metadata),
  };
}

function parseQueryInteger(
  value: unknown,
  {
    minimum,
  }: {
    minimum: number;
  },
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < minimum) {
    return null;
  }

  return parsed;
}

function sendBadRequest(response: Response, error: string) {
  response.status(400).json({ error });
}

export function createActivitiesRouter({
  db,
  broadcaster = sse,
  defaultLimit = 50,
}: CreateActivitiesRouterOptions = {}) {
  const router = Router();
  const resolveDb = () => db ?? getDatabase();

  router.get("/", (request, response) => {
    const limit = parseQueryInteger(getSingleValue(request.query.limit), {
      minimum: 1,
    });
    const offset = parseQueryInteger(getSingleValue(request.query.offset), {
      minimum: 0,
    });

    if (request.query.limit !== undefined && limit === null) {
      sendBadRequest(response, "limit must be a positive integer.");
      return;
    }

    if (request.query.offset !== undefined && offset === null) {
      sendBadRequest(response, "offset must be a non-negative integer.");
      return;
    }

    const activities = resolveDb()
      .prepare("SELECT * FROM activities ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
      .all(limit ?? defaultLimit, offset ?? 0) as ActivityRow[];

    response.json({ activities: activities.map(serializeActivity) });
  });

  router.get("/stream", (request, response) => {
    broadcaster.addClient(response);

    const removeClient = () => {
      broadcaster.removeClient(response);
    };

    request.on("close", removeClient);
    response.on("close", removeClient);
  });

  return router;
}

export const activitiesRouter = createActivitiesRouter();
