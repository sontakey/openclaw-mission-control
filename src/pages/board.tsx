import React from "react";
import { Bell } from "lucide-react";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import { NewTaskDialog } from "@/components/kanban/new-task-dialog";
import {
  type ColumnVariant,
  type KanbanColumnDef,
  type KanbanTask,
} from "@/components/kanban/types";
import { LiveFeed, LiveFeedTitle } from "@/components/live-feed";
import { ChatPanelToggle } from "@/components/layout/chat-panel-toggle";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderRow,
  PageHeaderTitle,
} from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/hooks/useTasks";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { useDrawer } from "@/providers/drawer-provider";

const BOARD_COLUMN_CONFIG: Array<{
  id: TaskStatus;
  title: string;
  variant: ColumnVariant;
}> = [
  { id: "inbox", title: "Inbox", variant: "inbox" },
  { id: "assigned", title: "Assigned", variant: "assigned" },
  { id: "in_progress", title: "In Progress", variant: "in-progress" },
  { id: "review", title: "Review", variant: "review" },
  { id: "done", title: "Done", variant: "done" },
];

export function mapTaskPriority(priority: TaskPriority): KanbanTask["priority"] {
  switch (priority) {
    case "high":
    case "urgent":
      return "high";
    case "low":
      return "low";
    default:
      return "medium";
  }
}

export function mapTaskToKanbanTask(task: Task): KanbanTask {
  return {
    assignee: task.assignee_agent_id ?? undefined,
    description: task.description ?? undefined,
    id: task.id,
    priority: mapTaskPriority(task.priority),
    status: task.status,
    subtasks: task.subtasks.map((subtask) => ({
      assignee: subtask.assignee_agent_id ?? undefined,
      blockedReason: subtask.blocked_reason ?? undefined,
      description: undefined,
      done: subtask.done,
      doneAt: subtask.done_at ?? undefined,
      id: subtask.id,
      status: subtask.status,
      title: subtask.title,
    })),
    title: task.title,
  };
}

export function buildBoardColumns(tasks: Task[]): KanbanColumnDef[] {
  const columns = new Map<TaskStatus, KanbanColumnDef>(
    BOARD_COLUMN_CONFIG.map((column) => [
      column.id,
      {
        id: column.id,
        tasks: [],
        title: column.title,
        variant: column.variant,
      },
    ]),
  );

  for (const task of tasks) {
    columns.get(task.status)?.tasks.push(mapTaskToKanbanTask(task));
  }

  return BOARD_COLUMN_CONFIG.map((column) => columns.get(column.id)!);
}

const BoardPage = () => {
  const { error, isLoading, tasks } = useTasks();
  const { openDrawer } = useDrawer();

  const columns = React.useMemo(() => buildBoardColumns(tasks), [tasks]);

  const handleOpenFeed = React.useCallback(() => {
    openDrawer(<LiveFeed className="h-full" />, <LiveFeedTitle />);
  }, [openDrawer]);

  return (
    <>
      <PageHeader>
        <PageHeaderRow>
          <PageHeaderTitle>Board</PageHeaderTitle>
          <PageHeaderActions>
            <NewTaskDialog />
            <Button variant="outline" size="sm" onClick={handleOpenFeed}>
              <Bell className="h-4 w-4" />
              Activity
            </Button>
            <ChatPanelToggle />
          </PageHeaderActions>
        </PageHeaderRow>
      </PageHeader>

      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Review incoming work, track delivery, and keep the live activity stream close.
        </p>

        {error ? (
          <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error.message}
          </section>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-4 flex items-center justify-between gap-4 text-sm">
            <p className="text-muted-foreground">
              {isLoading && tasks.length === 0
                ? "Loading tasks..."
                : tasks.length === 0
                  ? "No tasks yet. Create one to populate the board."
                  : `${tasks.length} task${tasks.length === 1 ? "" : "s"} on the board.`}
            </p>
          </div>

          <div className="h-[70vh] min-h-[32rem]">
            <KanbanBoard columns={columns} className="h-full" />
          </div>
        </section>
      </div>
    </>
  );
};

export default BoardPage;
