import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { AppShell } from "../src/App.tsx";
import {
  BoardAttentionNeededSection,
  buildBoardColumns,
  getBoardAttentionItems,
  getBoardSummaryStats,
  mapTaskPriority,
  mapTaskToKanbanTask,
} from "../src/pages/board.tsx";
import type { Agent, Task } from "../src/lib/types.ts";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    assignee_agent_id: null,
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
    status: "inbox",
    subtasks: [],
    title: "Fix issue",
    updated_at: 1,
    ...overrides,
  };
}

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    children: [],
    currentActivity: null,
    currentTask: null,
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

test("board page renders task actions and empty kanban columns", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, />Board</);
  assert.match(html, />New</);
  assert.match(html, />Activity</);
  assert.match(html, /Active Agents/);
  assert.match(html, /In Progress/);
  assert.match(html, /In Review/);
  assert.match(html, /Completed 24h/);
  assert.match(html, />Inbox</);
  assert.match(html, />Assigned</);
  assert.match(html, />In Progress</);
  assert.match(html, />Review</);
  assert.match(html, />Done</);
  assert.match(html, /No tasks yet\. Create one to populate the board\./);
  assert.doesNotMatch(html, /Attention Needed/);
});

test("board summary stats count online agents, active work, and recent completions", () => {
  const now = Date.UTC(2026, 2, 25, 12, 0, 0);
  const recentCompletion = Math.floor(now / 1000) - 60;
  const staleCompletion = Math.floor(now / 1000) - 2 * 24 * 60 * 60;

  const stats = getBoardSummaryStats({
    agents: [
      createAgent({ id: "agent-online-1", status: "online" }),
      createAgent({ id: "agent-online-2", status: "online" }),
      createAgent({ id: "agent-offline", status: "offline" }),
    ],
    now,
    tasks: [
      createTask({ id: "task-progress", status: "in_progress" }),
      createTask({ id: "task-review", status: "review" }),
      createTask({ completed_at: recentCompletion, id: "task-done-recent", status: "done" }),
      createTask({ completed_at: staleCompletion, id: "task-done-stale", status: "done" }),
      createTask({ completed_at: null, id: "task-done-missing-time", status: "done" }),
      createTask({ id: "task-assigned", status: "assigned" }),
    ],
  });

  assert.deepEqual(stats, {
    activeAgents: 2,
    completed24h: 1,
    inProgress: 1,
    inReview: 1,
  });
});

test("board helpers normalize task priorities and group tasks by status", () => {
  const inboxTask = createTask({
    id: "task-inbox",
    priority: "low",
    status: "inbox",
  });
  const reviewTask = createTask({
    assignee_agent_id: "agent:marv",
    children: [
      createTask({
        assignee_agent_id: "agent:solo",
        id: "child-task-1",
        parent_task_id: "task-review",
        status: "assigned",
        title: "Coordinate owners",
      }),
    ],
    id: "task-review",
    metadata: {
      artifacts: [
        {
          label: "Deploy URL",
          type: "url",
          value: "https://deploy.example.com/review",
        },
        {
          label: "PRD",
          type: "file",
          value: "/tmp/review/PRD.md",
        },
        {
          label: "",
          type: "url",
          value: "https://invalid.example.com",
        },
      ],
    },
    parent_task_id: "plan-launch",
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
  assert.equal(kanbanTask.childTasks?.[0]?.id, "child-task-1");
  assert.equal(kanbanTask.childTasks?.[0]?.subtasks.length, 0);
  assert.equal(kanbanTask.parentTaskId, "plan-launch");
  assert.equal(kanbanTask.priority, "high");
  assert.deepEqual(kanbanTask.artifacts, [
    {
      label: "Deploy URL",
      type: "url",
      value: "https://deploy.example.com/review",
    },
    {
      label: "PRD",
      type: "file",
      value: "/tmp/review/PRD.md",
    },
  ]);
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

test("board attention items include failed work queue items and stale review tasks", () => {
  const now = Date.UTC(2026, 2, 25, 12, 0, 0);
  const items = getBoardAttentionItems({
    now,
    tasks: [
      createTask({
        id: "task-failed-queue",
        metadata: {
          source: "agent-work-queue",
          work_queue: {
            status: "failed",
          },
          work_queue_id: "queue-9",
        },
        status: "review",
        title: "Re-run deploy smoke test",
        updated_at: Math.floor(now / 1000) - 120,
      }),
      createTask({
        id: "task-stale-review",
        status: "review",
        title: "Approve release checklist",
        updated_at: Math.floor(now / 1000) - 3 * 60 * 60,
      }),
      createTask({
        id: "task-fresh-review",
        status: "review",
        title: "Fresh review item",
        updated_at: Math.floor(now / 1000) - 30 * 60,
      }),
      createTask({
        id: "task-running",
        status: "in_progress",
        title: "Implement alert card",
        updated_at: Math.floor(now / 1000) - 5 * 60 * 60,
      }),
    ],
  });

  assert.deepEqual(items, [
    {
      id: "task-failed-queue",
      label: "Failed Queue",
      note: "Work queue item queue-9 reported a failure.",
      severity: "red",
      title: "Re-run deploy smoke test",
    },
    {
      id: "task-stale-review",
      label: "Review >2h",
      note: "Task has been waiting in review for more than 2 hours.",
      severity: "amber",
      title: "Approve release checklist",
    },
  ]);
});

test("attention section renders only when attention items exist", () => {
  const html = renderToStaticMarkup(
    <BoardAttentionNeededSection
      items={[
        {
          id: "task-failed-queue",
          label: "Failed Queue",
          note: "Work queue item queue-9 reported a failure.",
          severity: "red",
          title: "Re-run deploy smoke test",
        },
        {
          id: "task-stale-review",
          label: "Review >2h",
          note: "Task has been waiting in review for more than 2 hours.",
          severity: "amber",
          title: "Approve release checklist",
        },
      ]}
    />,
  );

  assert.match(html, /Attention Needed/);
  assert.match(html, /Failed Queue/);
  assert.match(html, /Review &gt;2h/);
  assert.match(html, /Re-run deploy smoke test/);
  assert.match(html, /Approve release checklist/);
});
