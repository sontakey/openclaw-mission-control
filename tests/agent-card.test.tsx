import assert from "node:assert/strict";
import test from "node:test";

import type { Agent } from "../src/lib/types.ts";
import { AgentCard } from "../src/components/agents/agent-tree.tsx";

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

test("AgentCard forwards clicks to the agent detail handler", () => {
  const agent = createAgent({
    id: "alpha",
    name: "Alpha",
  });
  const clickedAgents: Agent[] = [];
  const element = AgentCard({
    agent,
    onSelectAgent: (nextAgent) => {
      clickedAgents.push(nextAgent);
    },
  });

  assert.equal(element.type, "button");
  assert.equal(element.props["aria-label"], "Open details for Alpha");
  element.props.onClick();
  assert.deepEqual(clickedAgents, [agent]);
});
