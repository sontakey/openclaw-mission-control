import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getDatabase } from "./db.js";
import { activitiesRouter } from "./routes/activities.js";
import { agentsRouter } from "./routes/agents.js";
import { chatRouter } from "./routes/chat.js";
import { gatewayRouter } from "./routes/gateway.js";
import { healthRouter } from "./routes/health.js";
import { tasksRouter } from "./routes/tasks.js";

export type CreateAppOptions = {
  clientDistPath?: string;
  initializeDatabase?: boolean;
};

export const CLIENT_DIST_PATH = resolve(process.cwd(), "dist/client");

export function createApp({
  clientDistPath = CLIENT_DIST_PATH,
  initializeDatabase = true,
}: CreateAppOptions = {}) {
  if (initializeDatabase) {
    getDatabase();
  }

  const app = express();
  const clientIndexPath = resolve(clientDistPath, "index.html");

  app.use(express.json());
  app.use("/health", healthRouter);
  app.use("/api/health", healthRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/activities", activitiesRouter);
  app.use("/api/agents", agentsRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/gateway", gatewayRouter);
  app.use(express.static(clientDistPath));

  app.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
    if (!existsSync(clientIndexPath)) {
      response.status(404).json({ error: "Client build not found." });
      return;
    }

    response.sendFile(clientIndexPath);
  });

  return app;
}

export const app = createApp();

function isDirectRun() {
  const entry = process.argv[1];

  if (!entry) {
    return false;
  }

  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectRun()) {
  const port = Number(process.env.PORT ?? 3100);

  app.listen(port, () => {
    console.log(`Mission Control server listening on port ${port}`);
  });
}
