import type { MissionControlDatabase } from "./db.js";
import { syncSessionsToTasks } from "./session-bridge.js";
import type { TaskSseBroadcaster } from "./routes/tasks.js";

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startSessionPoller(
  db: MissionControlDatabase,
  broadcaster: TaskSseBroadcaster,
  intervalMs = 15_000,
) {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  // Run immediately on start
  void syncSessionsToTasks(db, broadcaster).catch((err) => {
    console.error("Session poll error (initial):", err);
  });

  pollInterval = setInterval(() => {
    void syncSessionsToTasks(db, broadcaster).catch((err) => {
      console.error("Session poll error:", err);
    });
  }, intervalMs);

  console.log(`Session poller started (every ${intervalMs / 1000}s)`);
}

export function stopSessionPoller() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log("Session poller stopped");
  }
}
