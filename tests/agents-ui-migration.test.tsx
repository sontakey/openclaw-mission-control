import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFile(join(root, path), "utf8");
}

test("agents ui uses local hooks and utilities instead of Convex squad data", async () => {
  const [panel, page, item, list, header] = await Promise.all([
    readProjectFile("src/components/agents/agents-panel.tsx"),
    readProjectFile("src/pages/agents.tsx"),
    readProjectFile("src/components/agents/agents-panel-item.tsx"),
    readProjectFile("src/components/agents/agents-panel-list.tsx"),
    readProjectFile("src/components/agents/agents-panel-header.tsx"),
  ]);

  for (const [name, content] of Object.entries({
    "agents-panel-header.tsx": header,
    "agents-panel-item.tsx": item,
    "agents-panel-list.tsx": list,
    "agents-panel.tsx": panel,
    "pages/agents.tsx": page,
  })) {
    assert.doesNotMatch(
      content,
      /^"use client";\n/m,
      `${name} still declares use client`,
    );
  }

  assert.match(panel, /useAgents\(\)/, "agents panel should use useAgents()");
  assert.doesNotMatch(
    panel,
    /useQuery\(api\.agents\.squad/,
    "agents panel should not use api.agents.squad",
  );

  assert.match(page, /useSquad\(\)/, "agents page should use useSquad()");
  assert.doesNotMatch(
    page,
    /useAgents\(\)/,
    "agents page should not create a second agents polling store",
  );
  assert.doesNotMatch(
    page,
    /useQuery\(api\.agents\.squad/,
    "agents page should not use api.agents.squad",
  );

  assert.match(
    item,
    /from "@\/lib\/agents"/,
    "agents panel item should import deriveStatus from @/lib/agents",
  );
  assert.doesNotMatch(
    item,
    /@clawe\/shared\/agents/,
    "agents panel item should not import @clawe/shared/agents",
  );
});

test("agents ui uses local agent fields and removes the weekly routine grid", async () => {
  const [page, list, item, tree] = await Promise.all([
    readProjectFile("src/pages/agents.tsx"),
    readProjectFile("src/components/agents/agents-panel-list.tsx"),
    readProjectFile("src/components/agents/agents-panel-item.tsx"),
    readProjectFile("src/components/agents/agent-tree.tsx"),
  ]);

  assert.match(page, /AgentTree/, "agents page should render the agent tree");
  assert.match(
    tree,
    /key=\{agent\.id\}/,
    "agent tree should key cards by agent.id",
  );
  assert.match(
    tree,
    /currentActivity|currentTask/,
    "agent tree should render agent activity or task details",
  );
  assert.doesNotMatch(
    tree,
    /agent\._id|WeeklyRoutineGrid|weekly-routine-grid/,
    "agent tree still references removed Convex fields or weekly routine grid",
  );

  assert.match(list, /agent\.id/, "agents panel list should use agent.id");
  assert.doesNotMatch(
    list,
    /agent\._id/,
    "agents panel list should not use agent._id",
  );

  assert.match(
    item,
    /lastHeartbeat/,
    "agents panel item should derive recency from lastHeartbeat",
  );
  assert.doesNotMatch(
    item,
    /lastSeen/,
    "agents panel item should not reference lastSeen",
  );

  await assert.rejects(
    access(join(root, "src/components/agents/weekly-routine-grid.tsx")),
    { code: "ENOENT" },
  );
});
