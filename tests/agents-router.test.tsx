import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { PassThrough } from "node:stream";

import express from "express";

import { createAgentsRouter } from "../server/routes/agents.js";

async function requestApp(
  app: express.Express,
  {
    method = "GET",
    path,
  }: {
    method?: string;
    path: string;
  },
) {
  const socket = new PassThrough();
  const request = new IncomingMessage(socket);
  const response = new ServerResponse(request);
  const chunks: Buffer[] = [];

  request.method = method;
  request.url = path;
  request.headers = {
    host: "127.0.0.1",
  };

  socket.on("data", (chunk) => {
    chunks.push(Buffer.from(chunk));
  });

  const finished = new Promise<void>((resolve, reject) => {
    response.on("finish", resolve);
    response.on("error", reject);
  });

  response.assignSocket(socket);
  app(request, response);
  await finished;

  const rawResponse = Buffer.concat(chunks).toString("utf8");
  const [, responseBody = ""] = rawResponse.split("\r\n\r\n");

  return {
    body: responseBody ? (JSON.parse(responseBody) as unknown) : null,
    status: response.statusCode,
  };
}

function createTestApp(options: Parameters<typeof createAgentsRouter>[0]) {
  const app = express();
  app.use("/api/agents", createAgentsRouter(options));
  return app;
}

function stripCurrentTask(agent: Record<string, unknown>) {
  const { currentTask: _currentTask, ...rest } = agent;
  return rest;
}

function assertCurrentTaskShape(value: unknown) {
  if (value === null) {
    return;
  }

  assert.equal(typeof value, "object");
  assert.ok(value !== null);
  assert.equal(typeof (value as { id?: unknown }).id, "string");
  assert.equal(typeof (value as { title?: unknown }).title, "string");
  assert.equal(typeof (value as { status?: unknown }).status, "string");
}

test("agents router merges configured agents with live sessions", async () => {
  let configCalls = 0;
  let sessionCalls = 0;
  const app = createTestApp({
    getConfig: async () => {
      configCalls += 1;

      return {
        ok: true,
        result: {
          content: [
            {
              text: JSON.stringify({
                agents: {
                  list: [
                    {
                      emoji: "A",
                      id: "alpha",
                      name: "Alpha",
                      role: "Lead",
                      sessionKey: "agent:alpha:main",
                    },
                    {
                      emoji: "B",
                      id: "beta",
                      name: "Beta",
                      role: "Builder",
                      sessionKey: "agent:beta:main",
                    },
                  ],
                },
              }),
            },
          ],
        },
      };
    },
    listSessions: async () => {
      sessionCalls += 1;

      return {
        ok: true,
        result: {
          content: [
            {
              text: JSON.stringify({
                sessions: [
                  {
                    agentId: "alpha",
                    currentActivity: "Planning",
                    lastHeartbeat: 1_700_000_000,
                    sessionKey: "agent:alpha:main",
                  },
                  {
                    currentActivity: "Debugging",
                    lastActivity: 1_700_003_600,
                    sessionKey: "agent:alpha:debug",
                  },
                ],
              }),
            },
          ],
        },
      };
    },
  });

  const response = await requestApp(app, { path: "/api/agents" });
  const agents = response.body as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.deepEqual(agents.map(stripCurrentTask), [
    {
      children: ["beta"],
      currentActivity: "Debugging",
      delegatesTo: [],
      emoji: "A",
      id: "alpha",
      lastHeartbeat: 1_700_003_600_000,
      name: "Alpha",
      parentId: null,
      role: "Lead",
      sessionKey: "agent:alpha:debug",
      status: "online",
    },
    {
      children: [],
      currentActivity: null,
      delegatesTo: [],
      emoji: "B",
      id: "beta",
      lastHeartbeat: null,
      name: "Beta",
      parentId: "alpha",
      role: "Builder",
      sessionKey: "agent:beta:main",
      status: "offline",
    },
  ]);
  agents.forEach((agent) => {
    assert.ok("currentTask" in agent);
    assertCurrentTaskShape(agent.currentTask);
  });
  assert.equal(configCalls, 1);
  assert.equal(sessionCalls, 1);
});

test("agents router returns live sessions for one agent", async () => {
  const app = createTestApp({
    getConfig: async () => ({
      agents: {
        list: [
          {
            id: "alpha",
            name: "Alpha",
            role: "Lead",
          },
        ],
      },
    }),
    listSessions: async () => ({
      sessions: [
        {
          agentId: "alpha",
          currentActivity: "Main loop",
          lastHeartbeat: "2026-03-20T12:00:00.000Z",
          mode: "main",
          sessionKey: "agent:alpha:main",
        },
        {
          activity: "Debug shell",
          lastActivity: 1_710_936_000,
          mode: "debug",
          sessionKey: "agent:alpha:debug",
        },
        {
          agentId: "beta",
          currentActivity: "Elsewhere",
          lastHeartbeat: 1_710_000_000,
          sessionKey: "agent:beta:main",
        },
      ],
    }),
  });

  const response = await requestApp(app, { path: "/api/agents/alpha/sessions" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    {
      agentId: "alpha",
      currentActivity: "Main loop",
      lastHeartbeat: Date.parse("2026-03-20T12:00:00.000Z"),
      mode: "main",
      sessionKey: "agent:alpha:main",
    },
    {
      activity: "Debug shell",
      agentId: "alpha",
      currentActivity: "Debug shell",
      lastActivity: 1_710_936_000,
      lastHeartbeat: 1_710_936_000_000,
      mode: "debug",
      sessionKey: "agent:alpha:debug",
    },
  ]);
});

test("agents router adds hierarchy fields from configured subagents", async () => {
  const app = createTestApp({
    getConfig: async () => ({
      agents: {
        list: [
          {
            emoji: "🔧",
            id: "marv",
            name: "Marv",
            role: "Engineer",
            subagents: {
              allowAgents: ["kevin"],
            },
          },
          {
            default: true,
            emoji: "🎯",
            id: "anton",
            name: "Anton",
            role: "Orchestrator",
            subagents: {
              allowAgents: ["marv", "harry", "kevin"],
            },
          },
          {
            emoji: "📢",
            id: "harry",
            name: "Harry",
            role: "Marketing",
            subagents: {
              allowAgents: ["penny"],
            },
          },
          {
            emoji: "🧪",
            id: "kevin",
            name: "Kevin",
            role: "QA",
          },
          {
            emoji: "📝",
            id: "penny",
            name: "Penny",
            role: "Research",
          },
          {
            emoji: "🗣️",
            id: "voice",
            name: "Voice",
            role: "Assistant",
          },
        ],
      },
    }),
    listSessions: async () => ({
      sessions: [],
    }),
  });

  const response = await requestApp(app, { path: "/api/agents" });
  const agents = response.body as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.deepEqual(agents.map(stripCurrentTask), [
    {
      children: [],
      currentActivity: null,
      delegatesTo: ["kevin"],
      emoji: "🔧",
      id: "marv",
      lastHeartbeat: null,
      name: "Marv",
      parentId: "anton",
      role: "Engineer",
      sessionKey: null,
      status: "offline",
    },
    {
      children: ["marv", "harry", "kevin", "penny", "voice"],
      currentActivity: null,
      delegatesTo: ["marv", "harry", "kevin"],
      emoji: "🎯",
      id: "anton",
      lastHeartbeat: null,
      name: "Anton",
      parentId: null,
      role: "Orchestrator",
      sessionKey: null,
      status: "offline",
    },
    {
      children: [],
      currentActivity: null,
      delegatesTo: ["penny"],
      emoji: "📢",
      id: "harry",
      lastHeartbeat: null,
      name: "Harry",
      parentId: "anton",
      role: "Marketing",
      sessionKey: null,
      status: "offline",
    },
    {
      children: [],
      currentActivity: null,
      delegatesTo: [],
      emoji: "🧪",
      id: "kevin",
      lastHeartbeat: null,
      name: "Kevin",
      parentId: "anton",
      role: "QA",
      sessionKey: null,
      status: "offline",
    },
    {
      children: [],
      currentActivity: null,
      delegatesTo: [],
      emoji: "📝",
      id: "penny",
      lastHeartbeat: null,
      name: "Penny",
      parentId: "anton",
      role: "Research",
      sessionKey: null,
      status: "offline",
    },
    {
      children: [],
      currentActivity: null,
      delegatesTo: [],
      emoji: "🗣️",
      id: "voice",
      lastHeartbeat: null,
      name: "Voice",
      parentId: "anton",
      role: "Assistant",
      sessionKey: null,
      status: "offline",
    },
  ]);
  agents.forEach((agent) => {
    assert.ok("currentTask" in agent);
    assertCurrentTaskShape(agent.currentTask);
  });
});

test("agents router caches gateway data for 30 seconds", async () => {
  let now = 1_000;
  let configCalls = 0;
  let sessionCalls = 0;
  const app = createTestApp({
    getConfig: async () => {
      configCalls += 1;

      return {
        agents: {
          list: [
            {
              emoji: "🤖",
              id: "alpha",
              name: `Alpha ${configCalls}`,
              role: "Lead",
            },
          ],
        },
      };
    },
    listSessions: async () => {
      sessionCalls += 1;

      return {
        sessions: [
          {
            agentId: "alpha",
            currentActivity: `Cycle ${sessionCalls}`,
            lastHeartbeat: 2_000_000_000_000 + sessionCalls,
            sessionKey: "agent:alpha:main",
          },
        ],
      };
    },
    now: () => now,
  });

  const firstResponse = await requestApp(app, { path: "/api/agents" });
  const secondResponse = await requestApp(app, { path: "/api/agents/alpha/sessions" });

  now += 29_999;
  const cachedResponse = await requestApp(app, { path: "/api/agents" });

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.equal(cachedResponse.status, 200);
  assert.equal(configCalls, 1);
  assert.equal(sessionCalls, 1);
  assert.deepEqual(cachedResponse.body, firstResponse.body);

  now += 2;
  const refreshedResponse = await requestApp(app, { path: "/api/agents" });
  const refreshedAgents = refreshedResponse.body as Array<Record<string, unknown>>;

  assert.equal(refreshedResponse.status, 200);
  assert.equal(configCalls, 2);
  assert.equal(sessionCalls, 2);
  assert.deepEqual(refreshedAgents.map(stripCurrentTask), [
    {
      children: [],
      currentActivity: "Cycle 2",
      delegatesTo: [],
      emoji: "🤖",
      id: "alpha",
      lastHeartbeat: 2_000_000_000_002,
      name: "Alpha 2",
      parentId: null,
      role: "Lead",
      sessionKey: "agent:alpha:main",
      status: "online",
    },
  ]);
  refreshedAgents.forEach((agent) => {
    assert.ok("currentTask" in agent);
    assertCurrentTaskShape(agent.currentTask);
  });
});
