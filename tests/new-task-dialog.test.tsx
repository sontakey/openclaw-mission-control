import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNewTaskDialogCreateTaskInput,
  getNewTaskDialogPlanOptions,
} from "../src/components/kanban/new-task-dialog.tsx";

test("getNewTaskDialogPlanOptions lists only top-level plans with children", () => {
  const plans = getNewTaskDialogPlanOptions([
    {
      child_count: 1,
      id: "plan-b",
      parent_task_id: null,
      title: "Beta launch",
    },
    {
      child_count: 0,
      id: "task-standalone",
      parent_task_id: null,
      title: "Inbox task",
    },
    {
      child_count: 3,
      id: "plan-a",
      parent_task_id: null,
      title: "Alpha launch",
    },
    {
      child_count: 1,
      id: "child-task",
      parent_task_id: "plan-a",
      title: "Child task",
    },
  ]);

  assert.deepEqual(plans, [
    { id: "plan-a", title: "Alpha launch" },
    { id: "plan-b", title: "Beta launch" },
  ]);
});

test("buildNewTaskDialogCreateTaskInput keeps the selected plan for child tasks", () => {
  const input = buildNewTaskDialogCreateTaskInput({
    createAsPlan: false,
    description: "  Draft the rollout checklist.  ",
    parentTaskId: "plan-1",
    priority: "high",
    title: "  Verify launch  ",
  });

  assert.deepEqual(input, {
    description: "  Draft the rollout checklist.  ",
    parentTaskId: "plan-1",
    priority: "high",
    title: "  Verify launch  ",
  });
});

test("buildNewTaskDialogCreateTaskInput clears the selected plan when creating a plan", () => {
  const input = buildNewTaskDialogCreateTaskInput({
    createAsPlan: true,
    description: "Optional details",
    parentTaskId: "plan-1",
    priority: "normal",
    title: "Launch plan",
  });

  assert.deepEqual(input, {
    description: "Optional details",
    priority: "normal",
    title: "Launch plan",
  });
});
