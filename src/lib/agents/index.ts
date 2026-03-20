export type AgentStatus = "online" | "offline";

export const ONLINE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes

/** If heartbeat is stale or missing, agent is offline */
export const deriveStatus = (agent: {
  status: string;
  lastHeartbeat?: number;
}): AgentStatus => {
  if (
    !agent.lastHeartbeat ||
    Date.now() - agent.lastHeartbeat > ONLINE_THRESHOLD_MS
  ) {
    return "offline";
  }
  return "online";
};
