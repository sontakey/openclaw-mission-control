import React from "react";
import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  AgentDetailDrawer,
  type AgentDetailData,
} from "../src/components/agents/agent-detail-drawer.tsx";
import type { Agent } from "../src/lib/types.ts";

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    children: [],
    currentActivity: "Reviewing priorities",
    currentTask: null,
    delegatesTo: [],
    emoji: "🤖",
    id: "agent-1",
    lastHeartbeat: 1_710_000_000_000,
    name: "Alpha",
    parentId: null,
    role: "Operator",
    sessionKey: "agent:alpha:main",
    status: "online",
    ...overrides,
  };
}

test("agent detail drawer renders sessions, tasks, and activity sections", () => {
  const agent = createAgent({
    currentTask: {
      id: "task-1",
      status: "review",
      title: "Review launch brief",
    },
  });
  const initialData: AgentDetailData = {
    activities: [
      {
        agent_id: "agent-1",
        created_at: 1_710_000_000_000,
        id: "activity-1",
        message: "Reviewed task queue",
        metadata: null,
        task_id: "task-1",
        type: "task_updated",
      },
    ],
    sessions: [
      {
        agentId: "agent-1",
        currentActivity: "Main loop",
        lastHeartbeat: 1_710_000_000_000,
        sessionKey: "agent:alpha:main",
      },
    ],
    tasks: [
      {
        assignee_agent_id: "agent-1",
        child_count: 0,
        completed_at: null,
        completion_stats: {
          completed: 0,
          total: 0,
        },
        created_at: 1_710_000_000_000,
        created_by: null,
        description: null,
        id: "task-1",
        metadata: null,
        priority: "normal",
        status: "review",
        title: "Review launch brief",
        updated_at: 1_710_000_000_000,
      },
    ],
  };

  const html = renderToStaticMarkup(
    <AgentDetailDrawer
      agent={agent}
      initialData={initialData}
      onClose={() => undefined}
      open
    />,
  );

  assert.match(html, /Alpha details/);
  assert.match(html, /Sessions/);
  assert.match(html, /Tasks/);
  assert.match(html, /Activity/);
  assert.match(html, /agent:alpha:main/);
  assert.match(html, /Review launch brief/);
  assert.match(html, /Reviewed task queue/);
});
