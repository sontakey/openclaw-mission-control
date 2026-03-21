import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TaskTmuxOutputPanel } from "../src/components/kanban/task-detail-modal.tsx";
import { mapTaskToKanbanTask } from "../src/pages/board.tsx";
import type { Task } from "../src/lib/types.ts";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    assignee_agent_id: "agent-1",
    children: [],
    comments: [],
    completed_at: null,
    created_at: 1,
    created_by: "operator",
    description: "Investigate the issue",
    id: "task-1",
    metadata: null,
    parent: null,
    parent_task_id: null,
    priority: "normal",
    status: "in_progress",
    subtasks: [],
    title: "Fix issue",
    updated_at: 1,
    ...overrides,
  };
}

test("task detail modal renders live tmux output chrome for Ralph tasks", () => {
  const task = mapTaskToKanbanTask(
    createTask({
      metadata: {
        source: "agent-work-queue",
        work_queue: {
          loop_manager: "ralph",
          tmux_session: "ralph.1",
        },
        work_queue_id: "queue-1",
      },
    }),
  );

  assert.equal(task.loopManager, "ralph");
  assert.equal(task.tmuxSession, "ralph.1");

  const html = renderToStaticMarkup(
    <TaskTmuxOutputPanel
      isLoading
      loopManager={task.loopManager}
      session={String(task.tmuxSession)}
      status={task.status}
    />,
  );

  assert.match(html, /Live tmux output/);
  assert.match(html, /ralph loop · ralph\.1/);
  assert.match(html, /Connecting to tmux session\.\.\./);
});
