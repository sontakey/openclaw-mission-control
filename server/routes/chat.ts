import { Router } from "express";
import type { Response } from "express";

import { getSessionHistory, sendToSession } from "../gateway-client.js";

type ChatMessageRole = "assistant" | "system" | "user";

type CleanChatMessage = {
  content: string;
  createdAt: number | null;
  id: string;
  role: ChatMessageRole;
};

type CreateChatRouterOptions = {
  getSessionHistory?: (sessionKey: string, limit?: number) => Promise<unknown>;
  sendToSession?: (sessionKey: string, message: string, timeoutSeconds?: number) => Promise<unknown>;
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

function getTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function getMessageRole(value: unknown): ChatMessageRole | null {
  if (typeof value !== "string") {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "assistant":
    case "agent":
    case "ai":
    case "model":
      return "assistant";
    case "context":
    case "system":
    case "tool":
      return "system";
    case "human":
    case "operator":
    case "user":
      return "user";
    default:
      return null;
  }
}

function extractMessageContent(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractMessageContent(item))
      .filter((item): item is string => item !== null);

    return parts.length > 0 ? parts.join("\n") : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "text" && typeof value.text === "string") {
    return extractMessageContent(value.text);
  }

  return (
    extractMessageContent(value.content) ??
    extractMessageContent(value.text) ??
    extractMessageContent(value.message) ??
    extractMessageContent(value.parts)
  );
}

function normalizeMessage(value: unknown, index: number): CleanChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const role =
    getMessageRole(value.role) ??
    getMessageRole(value.sender) ??
    getMessageRole(value.author) ??
    getMessageRole(value.type);
  const content =
    extractMessageContent(value.content) ??
    extractMessageContent(value.text) ??
    extractMessageContent(value.message);

  if (!role || !content) {
    return null;
  }

  return {
    content,
    createdAt: getTimestamp(value, [
      "createdAt",
      "created_at",
      "sentAt",
      "sent_at",
      "timestamp",
      "time",
      "updatedAt",
      "updated_at",
    ]),
    id:
      getTrimmedString(value.id) ??
      getTrimmedString(value.messageId) ??
      getTrimmedString(value.message_id) ??
      `message-${index}`,
    role,
  };
}

function getMessageList(value: unknown) {
  const payload = unwrapGatewayPayload(value);

  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  if (Array.isArray(payload.messages)) {
    return payload.messages;
  }

  if (Array.isArray(payload.history)) {
    return payload.history;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  return [];
}

function cleanMessages(value: unknown) {
  return getMessageList(value)
    .map((message, index) => normalizeMessage(message, index))
    .filter((message): message is CleanChatMessage => message !== null);
}

function sendBadRequest(response: Response, error: string) {
  response.status(400).json({ error });
}

async function sendHistoryResponse(
  response: Response,
  loadSessionHistory: (sessionKey: string, limit?: number) => Promise<unknown>,
  sessionKey: string | undefined,
) {
  if (!sessionKey) {
    sendBadRequest(response, "sessionKey is required.");
    return;
  }

  try {
    const history = await loadSessionHistory(sessionKey);
    response.json(cleanMessages(history));
  } catch {
    response.status(502).json({ error: "Failed to load chat history." });
  }
}

export function createChatRouter({
  getSessionHistory: loadSessionHistory = getSessionHistory,
  sendToSession: sendMessageToSession = sendToSession,
}: CreateChatRouterOptions = {}) {
  const router = Router();

  router.post("/send", async (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    const sessionKey = getTrimmedString(body.sessionKey);
    const message = getTrimmedString(body.message);

    if (!sessionKey) {
      sendBadRequest(response, "sessionKey is required.");
      return;
    }

    if (!message) {
      sendBadRequest(response, "message is required.");
      return;
    }

    try {
      const result = unwrapGatewayPayload(await sendMessageToSession(sessionKey, message));

      if (typeof result === "string") {
        response.json({ response: result });
        return;
      }

      response.json(result ?? {});
    } catch {
      response.status(502).json({ error: "Failed to send chat message." });
    }
  });

  router.get("/history", async (request, response) => {
    await sendHistoryResponse(
      response,
      loadSessionHistory,
      getTrimmedString(request.query.sessionKey),
    );
  });

  router.get("/history/:sessionKey", async (request, response) => {
    await sendHistoryResponse(
      response,
      loadSessionHistory,
      getTrimmedString(request.params.sessionKey),
    );
  });

  return router;
}

export const chatRouter = createChatRouter();
