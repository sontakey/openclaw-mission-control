import assert from "node:assert/strict";
import test from "node:test";

import type {
  Agent,
  AgentHierarchyNode,
  Task,
  TaskRecord,
} from "../src/lib/types.ts";

function createTaskRecord(overrides: Partial<TaskRecord> = {}) {
  return {
    assignee_agent_id: null,
    completed_at: null,
    created_at: 1,
    created_by: "operator",
    description: null,
    id: "task-1",
    metadata: null,
    parent_task_id: null,
    priority: "normal",
    status: "inbox",
    title: "Task",
    updated_at: 1,
    ...overrides,
  } satisfies TaskRecord;
}

function createTask(overrides: Partial<Task> = {}) {
  return {
    ...createTaskRecord(),
    children: [],
    comments: [],
    parent: null,
    parent_task_id: null,
    subtasks: [],
    ...overrides,
  } satisfies Task;
}

function createAgent(overrides: Partial<Agent> = {}) {
  return {
    children: [],
    currentActivity: null,
    delegatesTo: [],
    emoji: "🤖",
    id: "agent-1",
    lastHeartbeat: null,
    name: "Alpha",
    parentId: null,
    role: "Operator",
    sessionKey: null,
    status: "offline",
    ...overrides,
  } satisfies Agent;
}

test("Task exposes explicit hierarchy fields for parent and children detail", () => {
  const parent = createTaskRecord({
    child_count: 1,
    id: "plan-1",
    title: "Launch plan",
  });
  const child = createTaskRecord({
    id: "child-1",
    parent_task_id: "task-1",
    title: "Ship API",
  });
  const task = createTask({
    children: [child],
    id: "task-1",
    parent,
    parent_task_id: "plan-1",
    title: "Review launch copy",
  });

  assert.equal(task.parent_task_id, "plan-1");
  assert.equal(task.parent?.id, "plan-1");
  assert.equal(task.children.length, 1);
  assert.equal(task.children[0]?.parent_task_id, "task-1");
});

test("AgentHierarchyNode supports recursive agent trees", () => {
  const hierarchy = {
    agent: createAgent({
      children: ["agent-2"],
      id: "agent-1",
      name: "Atlas",
    }),
    children: [
      {
        agent: createAgent({
          id: "agent-2",
          name: "Penny",
          parentId: "agent-1",
        }),
        children: [],
      },
    ],
  } satisfies AgentHierarchyNode;

  assert.equal(hierarchy.agent.id, "agent-1");
  assert.equal(hierarchy.children[0]?.agent.parentId, "agent-1");
  assert.deepEqual(hierarchy.agent.children, ["agent-2"]);
});
