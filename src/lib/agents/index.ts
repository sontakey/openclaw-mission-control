export type AgentStatus = "online" | "offline";

export const ONLINE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Derive agent status. Prefers the server-computed status when available,
 * falling back to heartbeat-based derivation for backward compatibility.
 */
export const deriveStatus = (agent: {
  status: string;
  lastHeartbeat?: number;
}): AgentStatus => {
  // Trust server-computed status if it's a valid value
  if (agent.status === "online" || agent.status === "offline") {
    return agent.status;
  }
  // Fallback: derive from heartbeat
  if (
    !agent.lastHeartbeat ||
    Date.now() - agent.lastHeartbeat > ONLINE_THRESHOLD_MS
  ) {
    return "offline";
  }
  return "online";
};
