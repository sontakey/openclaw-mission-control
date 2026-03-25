import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BoardAgentStatusList } from "../src/components/agents/board-agent-status-list.tsx";
import type { Agent } from "../src/lib/types.ts";

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    children: [],
    currentActivity: null,
    currentTask: null,
    delegatesTo: [],
    emoji: "🤖",
    id: "agent-1",
    lastHeartbeat: Date.now(),
    name: "Alpha",
    parentId: null,
    role: "Operator",
    sessionKey: "agent:alpha:main",
    status: "online",
    ...overrides,
  };
}

test("board agent status list renders task, activity, and idle states", () => {
  const html = renderToStaticMarkup(
    <BoardAgentStatusList
      agents={[
        createAgent({
          currentActivity: "Validating launch copy",
          currentTask: {
            id: "task-1",
            status: "in_progress",
            title: "Review launch brief",
          },
          name: "Alpha",
        }),
        createAgent({
          currentActivity: "Working through backlog",
          id: "agent-2",
          lastHeartbeat: null,
          name: "Bravo",
          status: "offline",
        }),
        createAgent({
          id: "agent-3",
          name: "Charlie",
        }),
      ]}
    />,
  );

  assert.match(html, /Agent Status/);
  assert.match(html, /Alpha/);
  assert.match(html, /Online/);
  assert.match(html, /Current task/);
  assert.match(html, /in progress/);
  assert.match(html, /Review launch brief/);
  assert.match(html, /Validating launch copy/);
  assert.match(html, /Bravo/);
  assert.match(html, /Offline/);
  assert.match(html, /Current activity/);
  assert.match(html, /Working through backlog/);
  assert.match(html, /Charlie/);
  assert.match(html, />Idle</);
});

test("board agent status list shows an empty state", () => {
  const html = renderToStaticMarkup(<BoardAgentStatusList agents={[]} />);

  assert.match(html, /Agent Status/);
  assert.match(html, /No agents are reporting yet\./);
});
