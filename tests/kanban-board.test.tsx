import assert from "node:assert/strict";
import test from "node:test";

import {
  getPlanStatus,
  groupKanbanColumnsByParent,
} from "../src/components/kanban/kanban-board.tsx";
import type { KanbanColumnDef, KanbanTask } from "../src/components/kanban/types.ts";

function createTask(overrides: Partial<KanbanTask> = {}): KanbanTask {
  return {
    id: "task-1",
    priority: "medium",
    status: "inbox",
    subtasks: [],
    title: "Task",
    ...overrides,
  };
}

function createColumns(): KanbanColumnDef[] {
  return [
    { id: "inbox", tasks: [], title: "Inbox", variant: "inbox" },
    { id: "assigned", tasks: [], title: "Assigned", variant: "assigned" },
    { id: "in_progress", tasks: [], title: "In Progress", variant: "in-progress" },
    { id: "review", tasks: [], title: "Review", variant: "review" },
    { id: "done", tasks: [], title: "Done", variant: "done" },
  ];
}

test("getPlanStatus uses the least-advanced child status", () => {
  const status = getPlanStatus([
    createTask({ id: "child-1", status: "review" }),
    createTask({ id: "child-2", status: "assigned" }),
    createTask({ id: "child-3", status: "done" }),
  ]);

  assert.equal(status, "assigned");
});

test("groupKanbanColumnsByParent collapses children into a plan card and preserves standalone tasks", () => {
  const columns = createColumns();
  columns[1]?.tasks.push(
    createTask({
      id: "child-assigned",
      parentTaskId: "plan-1",
      status: "assigned",
      title: "Coordinate owners",
    }),
  );
  columns[2]?.tasks.push(
    createTask({
      id: "child-progress",
      parentTaskId: "plan-1",
      status: "in_progress",
      title: "Run verification",
    }),
  );
  columns[3]?.tasks.push(
    createTask({
      id: "plan-1",
      priority: "high",
      status: "review",
      title: "Launch plan",
    }),
    createTask({
      id: "task-standalone",
      status: "review",
      title: "Review release notes",
    }),
  );
  columns[4]?.tasks.push(
    createTask({
      id: "task-done",
      status: "done",
      title: "Archive incident",
    }),
  );

  const groupedColumns = groupKanbanColumnsByParent(columns);

  assert.deepEqual(
    groupedColumns.map((column) => [column.id, column.tasks.map((task) => task.id)]),
    [
      ["inbox", []],
      ["assigned", ["plan-1"]],
      ["in_progress", []],
      ["review", ["task-standalone"]],
      ["done", ["task-done"]],
    ],
  );

  assert.equal(groupedColumns[1]?.tasks[0]?.status, "assigned");
  assert.deepEqual(
    groupedColumns[1]?.tasks[0]?.childTasks?.map((task) => task.id),
    ["child-assigned", "child-progress"],
  );
});

test("groupKanbanColumnsByParent leaves orphaned child tasks in place", () => {
  const columns = createColumns();
  columns[0]?.tasks.push(
    createTask({
      id: "orphan-child",
      parentTaskId: "missing-plan",
      status: "inbox",
      title: "Unparented work item",
    }),
  );

  const groupedColumns = groupKanbanColumnsByParent(columns);

  assert.deepEqual(
    groupedColumns.map((column) => [column.id, column.tasks.map((task) => task.id)]),
    [
      ["inbox", ["orphan-child"]],
      ["assigned", []],
      ["in_progress", []],
      ["review", []],
      ["done", []],
    ],
  );
});
