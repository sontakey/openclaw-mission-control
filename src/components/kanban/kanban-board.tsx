import React, { useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { KanbanColumn } from "./kanban-column";
import { TaskDetailModal } from "./task-detail-modal";
import type { KanbanBoardProps, KanbanTask } from "./types";

const BOARD_STATUSES = ["inbox", "assigned", "in_progress", "review", "done"] as const;

type BoardStatus = (typeof BOARD_STATUSES)[number];

function getBoardStatus(status?: string): BoardStatus | undefined {
  return BOARD_STATUSES.find((candidate) => candidate === status);
}

function getTaskStatus(task: KanbanTask, fallbackColumnId?: string): BoardStatus {
  return getBoardStatus(task.status) ?? getBoardStatus(fallbackColumnId) ?? "inbox";
}

export function getPlanStatus(
  childTasks: KanbanTask[],
  fallbackStatus?: KanbanTask["status"],
): BoardStatus {
  if (childTasks.length === 0) {
    return getBoardStatus(fallbackStatus) ?? "inbox";
  }

  let furthestBehindStatus = getTaskStatus(childTasks[0]!);
  let furthestBehindIndex = BOARD_STATUSES.indexOf(furthestBehindStatus);

  for (const childTask of childTasks.slice(1)) {
    const childStatus = getTaskStatus(childTask);
    const childStatusIndex = BOARD_STATUSES.indexOf(childStatus);

    if (childStatusIndex < furthestBehindIndex) {
      furthestBehindStatus = childStatus;
      furthestBehindIndex = childStatusIndex;
    }
  }

  return furthestBehindStatus;
}

export function groupKanbanColumnsByParent(
  columns: KanbanBoardProps["columns"],
): KanbanBoardProps["columns"] {
  const orderedTasks: Array<{
    columnId: string;
    orderIndex: number;
    task: KanbanTask;
  }> = [];

  let orderIndex = 0;
  for (const column of columns) {
    for (const task of column.tasks) {
      orderedTasks.push({
        columnId: column.id,
        orderIndex,
        task,
      });
      orderIndex += 1;
    }
  }

  const tasksById = new Map(
    orderedTasks.map((entry) => [entry.task.id, entry] as const),
  );
  const childTasksByParent = new Map<
    string,
    Array<{
      orderIndex: number;
      task: KanbanTask;
    }>
  >();

  for (const entry of orderedTasks) {
    if (!entry.task.parentTaskId || !tasksById.has(entry.task.parentTaskId)) {
      continue;
    }

    const childTasks = childTasksByParent.get(entry.task.parentTaskId) ?? [];
    childTasks.push({
      orderIndex: entry.orderIndex,
      task: entry.task,
    });
    childTasksByParent.set(entry.task.parentTaskId, childTasks);
  }

  const parentIdsWithChildren = new Set(childTasksByParent.keys());
  const groupedTaskEntriesByColumn = new Map(
    columns.map((column) => [column.id, [] as Array<{ orderIndex: number; task: KanbanTask }>] as const),
  );

  for (const entry of orderedTasks) {
    const hasParentOnBoard =
      entry.task.parentTaskId !== undefined && tasksById.has(entry.task.parentTaskId);

    if (hasParentOnBoard || parentIdsWithChildren.has(entry.task.id)) {
      continue;
    }

    groupedTaskEntriesByColumn.get(entry.columnId)?.push({
      orderIndex: entry.orderIndex,
      task: entry.task,
    });
  }

  for (const [parentId, childEntries] of childTasksByParent) {
    const parentEntry = tasksById.get(parentId);

    if (!parentEntry) {
      continue;
    }

    if (parentEntry.task.parentTaskId && tasksById.has(parentEntry.task.parentTaskId)) {
      continue;
    }

    const childTasks = childEntries.map((entry) => entry.task);
    const planStatus = getPlanStatus(childTasks, parentEntry.task.status);
    const planOrderIndex = Math.min(
      parentEntry.orderIndex,
      ...childEntries.map((entry) => entry.orderIndex),
    );

    groupedTaskEntriesByColumn.get(planStatus)?.push({
      orderIndex: planOrderIndex,
      task: {
        ...parentEntry.task,
        childTasks,
        status: planStatus,
      },
    });
  }

  return columns.map((column) => ({
    ...column,
    tasks: [...(groupedTaskEntriesByColumn.get(column.id) ?? [])]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((entry) => entry.task),
  }));
}

export const KanbanBoard = ({ columns, className }: KanbanBoardProps) => {
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const groupedColumns = React.useMemo(
    () => groupKanbanColumnsByParent(columns),
    [columns],
  );

  const handleTaskClick = (task: KanbanTask) => {
    setSelectedTask(task);
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      setSelectedTask(null);
    }
  };

  return (
    <>
      <ScrollArea
        type="scroll"
        className={cn("h-full w-full", className)}
        data-kanban-board
      >
        <div className="flex h-full gap-2 pb-4">
          {groupedColumns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              onTaskClick={handleTaskClick}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <TaskDetailModal
        task={selectedTask}
        open={selectedTask !== null}
        onOpenChange={handleModalClose}
      />
    </>
  );
};
