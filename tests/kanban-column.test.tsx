import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { KanbanColumn } from "../src/components/kanban/kanban-column.tsx";
import type { KanbanColumnDef, KanbanTask } from "../src/components/kanban/types.ts";

function createTask(overrides: Partial<KanbanTask> = {}): KanbanTask {
  return {
    description: "Investigate and ship the work.",
    id: "task-1",
    priority: "medium",
    status: "review",
    subtasks: [],
    title: "Task",
    ...overrides,
  };
}

test("KanbanColumn renders plans as plan cards and standalone items as normal task cards", () => {
  const column: KanbanColumnDef = {
    id: "assigned",
    tasks: [
      createTask({
        childTasks: [
          createTask({
            assignee: "agent:marv",
            id: "child-1",
            status: "assigned",
            title: "Coordinate owners",
          }),
          createTask({
            assignee: "agent:penny",
            id: "child-2",
            status: "done",
            title: "Ship checks",
          }),
        ],
        id: "plan-1",
        priority: "high",
        status: "assigned",
        title: "Launch plan",
      }),
      createTask({
        assignee: "agent:solo",
        documentCount: 2,
        id: "task-standalone",
        subtasks: [
          {
            id: "subtask-1",
            title: "Draft fix",
          },
        ],
        title: "Fix the API route",
      }),
    ],
    title: "Assigned",
    variant: "assigned",
  };

  const html = renderToStaticMarkup(
    <KanbanColumn column={column} onTaskClick={() => undefined} />,
  );

  assert.equal(html.match(/data-plan-card/g)?.length, 1);
  assert.equal(html.match(/data-task-card/g)?.length, 1);
  assert.match(html, /Launch plan/);
  assert.match(html, /1\/2 complete/);
  assert.match(html, /Show children/);
  assert.match(html, /Fix the API route/);
  assert.match(html, />P3</);
  assert.match(html, /1 subtask/);
  assert.match(html, /2 docs/);
});
