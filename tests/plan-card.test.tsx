import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getPlanCardAgents,
  getPlanCardProgress,
  PlanCard,
} from "../src/components/kanban/plan-card.tsx";
import type { KanbanTask } from "../src/components/kanban/types.ts";

function createTask(overrides: Partial<KanbanTask> = {}): KanbanTask {
  return {
    description: "Coordinate rollout work across multiple agents.",
    documentCount: 2,
    id: "task-1",
    priority: "high",
    status: "in_progress",
    subtasks: [
      {
        assignee: "Atlas Lead",
        done: true,
        id: "subtask-1",
        status: "done",
        title: "Draft migration plan",
      },
      {
        assignee: "Marv Ops",
        done: false,
        id: "subtask-2",
        status: "in_progress",
        title: "Run verification pass",
      },
      {
        assignee: "Penny QA",
        blockedReason: "Waiting on schema review",
        done: false,
        id: "subtask-3",
        status: "blocked",
        title: "Ship release checks",
      },
      {
        assignee: "Jules Support",
        done: false,
        id: "subtask-4",
        status: "pending",
        title: "Prepare handoff notes",
      },
    ],
    title: "Launch coordination",
    ...overrides,
  };
}

test("getPlanCardAgents de-duplicates the task assignee and child assignees", () => {
  const task = createTask({
    assignee: "Atlas Lead",
    subtasks: [
      {
        assignee: "Atlas Lead",
        done: false,
        id: "subtask-a",
        status: "pending",
        title: "Coordinate owners",
      },
      {
        assignee: "Marv Ops",
        done: false,
        id: "subtask-b",
        status: "pending",
        title: "Verify staging",
      },
    ],
  });

  assert.deepEqual(getPlanCardAgents(task), ["Atlas Lead", "Marv Ops"]);
});

test("getPlanCardProgress counts completed children and computes the bar width", () => {
  const task = createTask();

  assert.deepEqual(getPlanCardProgress(task), {
    doneCount: 1,
    percent: 25,
    totalCount: 4,
  });
});

test("PlanCard renders progress, document count, and collapsed children by default", () => {
  const html = renderToStaticMarkup(
    <PlanCard task={createTask()} onTaskClick={() => undefined} />,
  );

  assert.match(html, /Plan/);
  assert.match(html, /High priority/);
  assert.match(html, /1\/4 complete/);
  assert.match(html, /style="width:25%"/);
  assert.match(html, /4 agents/);
  assert.match(html, /AL/);
  assert.match(html, /MO/);
  assert.match(html, /PQ/);
  assert.match(html, /\+1/);
  assert.match(html, /2 docs/);
  assert.match(html, /Show children/);
  assert.doesNotMatch(html, /Draft migration plan/);
  assert.doesNotMatch(html, /Waiting on schema review/);
});

test("PlanCard renders the child list when defaultExpanded is true", () => {
  const html = renderToStaticMarkup(
    <PlanCard
      task={createTask()}
      defaultExpanded
      onTaskClick={() => undefined}
    />,
  );

  assert.match(html, /Hide children/);
  assert.match(html, /Draft migration plan/);
  assert.match(html, /Run verification pass/);
  assert.match(html, /Ship release checks/);
  assert.match(html, /Waiting on schema review/);
  assert.match(html, /Jules Support/);
});
