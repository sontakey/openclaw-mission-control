import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { AppShell } from "../src/App.tsx";
import {
  buildBoardColumns,
  mapTaskPriority,
  mapTaskToKanbanTask,
} from "../src/pages/board.tsx";
import type { Task } from "../src/lib/types.ts";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    assignee_agent_id: null,
    comments: [],
    completed_at: null,
    created_at: 1,
    created_by: "operator",
    description: "Investigate the issue",
    id: "task-1",
    metadata: null,
    priority: "normal",
    status: "inbox",
    subtasks: [],
    title: "Fix issue",
    updated_at: 1,
    ...overrides,
  };
}

test("board page renders task actions and empty kanban columns", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, />Board</);
  assert.match(html, />New</);
  assert.match(html, />Activity</);
  assert.match(html, />Inbox</);
  assert.match(html, />Assigned</);
  assert.match(html, />In Progress</);
  assert.match(html, />Review</);
  assert.match(html, />Done</);
  assert.match(html, /No tasks yet\. Create one to populate the board\./);
});

test("board helpers normalize task priorities and group tasks by status", () => {
  const inboxTask = createTask({
    id: "task-inbox",
    priority: "low",
    status: "inbox",
  });
  const reviewTask = createTask({
    assignee_agent_id: "agent:marv",
    id: "task-review",
    priority: "urgent",
    status: "review",
    subtasks: [
      {
        assignee_agent_id: "agent:marv",
        blocked_reason: null,
        done: true,
        done_at: 5,
        id: "subtask-1",
        sort_order: 0,
        status: "done",
        task_id: "task-review",
        title: "Draft response",
      },
    ],
    title: "Review launch copy",
  });

  assert.equal(mapTaskPriority("normal"), "medium");
  assert.equal(mapTaskPriority("urgent"), "high");

  const kanbanTask = mapTaskToKanbanTask(reviewTask);
  assert.equal(kanbanTask.assignee, "agent:marv");
  assert.equal(kanbanTask.priority, "high");
  assert.equal(kanbanTask.subtasks[0]?.done, true);

  const columns = buildBoardColumns([reviewTask, inboxTask]);

  assert.deepEqual(
    columns.map((column) => [column.id, column.tasks.length]),
    [
      ["inbox", 1],
      ["assigned", 0],
      ["in_progress", 0],
      ["review", 1],
      ["done", 0],
    ],
  );
});
