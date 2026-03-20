import React from "react";
import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  AgentTree,
  formatLastSeen,
  organizeAgents,
} from "../src/components/agents/agent-tree.tsx";
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

test("organizeAgents builds hierarchy roots and separates standalone agents", () => {
  const ceo = createAgent({
    children: ["ops", "solo"],
    delegatesTo: ["ops"],
    id: "ceo",
    name: "Atlas",
    role: "Lead",
  });
  const ops = createAgent({
    children: ["qa"],
    delegatesTo: ["qa"],
    id: "ops",
    name: "Ops",
    parentId: "ceo",
    role: "Operations",
  });
  const qa = createAgent({
    id: "qa",
    name: "QA",
    parentId: "ops",
    role: "Verification",
  });
  const solo = createAgent({
    id: "solo",
    name: "Solo",
    role: "Research",
  });

  const result = organizeAgents([solo, qa, ceo, ops]);

  assert.equal(result.roots.length, 1);
  assert.equal(result.roots[0]?.agent.id, "ceo");
  assert.deepEqual(
    result.roots[0]?.children.map((child) => child.agent.id),
    ["ops"],
  );
  assert.deepEqual(
    result.roots[0]?.children[0]?.children.map((child) => child.agent.id),
    ["qa"],
  );
  assert.deepEqual(
    result.standalone.map((agent) => agent.id),
    ["solo"],
  );
});

test("AgentTree renders hierarchy cards, current task copy, and standalone agents", () => {
  const root = createAgent({
    children: ["child"],
    delegatesTo: ["child"],
    id: "root",
    name: "Ralph",
    role: "Coordinator",
  });
  const child = createAgent({
    currentActivity: null,
    id: "child",
    lastHeartbeat: null,
    name: "Penny",
    parentId: "root",
    role: "Implementer",
    sessionKey: null,
    status: "offline",
  });
  const solo = createAgent({
    id: "solo",
    name: "Marv",
    role: "Special Projects",
  });

  const html = renderToStaticMarkup(
    <AgentTree agents={[root, child, solo]} />,
  );

  assert.match(html, /Hierarchy/);
  assert.match(html, /Standalone agents/);
  assert.match(html, /Ralph/);
  assert.match(html, /Penny/);
  assert.match(html, /Marv/);
  assert.match(html, /Current task/);
  assert.match(html, /No task assigned/);
  assert.match(html, /Click for details/);
  assert.match(html, /Individual contributor/);
});

test("formatLastSeen handles missing timestamps", () => {
  assert.equal(formatLastSeen(null), "Never");
});
