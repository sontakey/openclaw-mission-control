export const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789";
export const GATEWAY_TOKEN = process.env.OPENCLAW_TOKEN;

type GatewayRequestBody = Record<string, unknown>;
export type GatewayHealth = {
  hasToken: boolean;
  latencyMs: number;
  status: "connected";
  url: string;
};

async function gatewayPost<T>(endpoint: string, body: GatewayRequestBody): Promise<T> {
  const response = await fetch(`${GATEWAY_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  return response.json() as Promise<T>;
}

export function invokeTool<T = unknown>(tool: string, args: Record<string, unknown> = {}) {
  return gatewayPost<T>("/tools/invoke", { tool, args });
}

export function listSessions<T = unknown>(activeMinutes?: number) {
  return invokeTool<T>("sessions_list", { activeMinutes });
}

export function sendToSession<T = unknown>(
  sessionKey: string,
  message: string,
  timeoutSeconds = 30,
) {
  return invokeTool<T>("sessions_send", { sessionKey, message, timeoutSeconds });
}

export function getSessionHistory<T = unknown>(sessionKey: string, limit = 50) {
  return invokeTool<T>("sessions_history", { sessionKey, limit });
}

export function listCrons<T = unknown>() {
  return invokeTool<T>("cron", { action: "list" });
}

export function getConfig<T = unknown>() {
  return invokeTool<T>("gateway", { action: "config.get" });
}

export async function getHealth(): Promise<GatewayHealth> {
  const startedAt = Date.now();

  await getConfig();

  return {
    hasToken: Boolean(GATEWAY_TOKEN),
    latencyMs: Math.max(0, Date.now() - startedAt),
    status: "connected",
    url: GATEWAY_URL,
  };
}
