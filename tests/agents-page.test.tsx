import React from "react";
import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  AgentsPageContent,
  DEFAULT_AGENT_VIEW_MODE,
} from "../src/pages/agents.tsx";
import { ChatPanelProvider } from "../src/providers/chat-panel-provider.tsx";
import type { Agent } from "../src/lib/types.ts";

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    children: [],
    currentActivity: "Reviewing priorities",
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

function renderAgentsPage({
  agents,
  initialViewMode,
}: {
  agents: Agent[];
  initialViewMode?: "grid" | "tree";
}) {
  return renderToStaticMarkup(
    <ChatPanelProvider>
      <AgentsPageContent
        agents={agents}
        initialViewMode={initialViewMode}
        isLoading={false}
        status="ready"
      />
    </ChatPanelProvider>,
  );
}

test("agents page defaults to tree view", () => {
  const root = createAgent({
    children: ["child"],
    delegatesTo: ["child"],
    id: "root",
    name: "Ralph",
    role: "Coordinator",
  });
  const child = createAgent({
    id: "child",
    name: "Penny",
    parentId: "root",
    role: "Implementer",
  });
  const solo = createAgent({
    id: "solo",
    name: "Marv",
    role: "Special Projects",
  });

  const html = renderAgentsPage({
    agents: [root, child, solo],
  });

  assert.equal(DEFAULT_AGENT_VIEW_MODE, "tree");
  assert.match(html, /data-view-mode="tree"/);
  assert.match(html, /Hierarchy/);
  assert.match(html, /Standalone agents/);
  assert.match(html, /aria-pressed="true"[^>]*>Tree</);
  assert.match(html, /aria-pressed="false"[^>]*>Grid</);
});

test("agents page renders grid view with the existing agent cards", () => {
  const root = createAgent({
    children: ["child"],
    currentTask: {
      id: "task-1",
      status: "assigned",
      title: "Review launch brief",
    },
    delegatesTo: ["child"],
    id: "root",
    name: "Ralph",
    role: "Coordinator",
  });
  const child = createAgent({
    id: "child",
    name: "Penny",
    parentId: "root",
    role: "Implementer",
  });
  const solo = createAgent({
    id: "solo",
    name: "Marv",
    role: "Special Projects",
  });

  const html = renderAgentsPage({
    agents: [root, child, solo],
    initialViewMode: "grid",
  });

  assert.match(html, /data-view-mode="grid"/);
  assert.doesNotMatch(html, /Hierarchy/);
  assert.doesNotMatch(html, /Standalone agents/);
  assert.match(html, /Ralph/);
  assert.match(html, /Penny/);
  assert.match(html, /Marv/);
  assert.match(html, /Current task/);
  assert.match(html, /Review launch brief/);
  assert.match(html, /1 report/);
  assert.match(html, /Individual contributor/);
  assert.match(html, /aria-pressed="true"[^>]*>Grid</);
});
