import React, { type ComponentType, type SVGProps } from "react";
import {
  Inbox,
  CircleDot,
  Play,
  Eye,
  CircleCheck,
  Mail,
  Moon,
  Target,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { PlanCard } from "./plan-card";
import {
  columnVariants,
  type KanbanColumnDef,
  type KanbanSubtask,
  type KanbanTask,
} from "./types";

const columnIconComponents: Record<
  KanbanColumnDef["variant"],
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  inbox: Inbox,
  assigned: CircleDot,
  "in-progress": Play,
  review: Eye,
  done: CircleCheck,
};

const emptyStateIcons: Record<
  KanbanColumnDef["variant"],
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  inbox: Mail,
  assigned: Moon,
  "in-progress": Moon,
  review: Moon,
  done: Target,
};

const EmptyState = ({ variant }: { variant: KanbanColumnDef["variant"] }) => {
  const EmptyIcon = emptyStateIcons[variant];
  const variantStyles = columnVariants[variant];

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <EmptyIcon
        className={cn("h-8 w-8", variantStyles.icon, "opacity-70")}
        strokeWidth={1}
      />
      <span className="text-muted-foreground mt-2 text-sm">Empty</span>
    </div>
  );
};

export type KanbanColumnProps = {
  column: KanbanColumnDef;
  onTaskClick: (task: KanbanTask) => void;
};

const priorityBadgeStyles: Record<KanbanTask["priority"], string> = {
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-200",
  low: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  medium: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200",
};

function getPriorityLabel(priority: KanbanTask["priority"]) {
  switch (priority) {
    case "high":
      return "High priority";
    case "low":
      return "Low priority";
    default:
      return "Medium priority";
  }
}

function getPlanChildStatus(status?: KanbanTask["status"]): NonNullable<KanbanSubtask["status"]> {
  switch (status) {
    case "done":
      return "done";
    case "review":
    case "in_progress":
      return "in_progress";
    default:
      return "pending";
  }
}

function buildPlanCardTask(task: KanbanTask): KanbanTask {
  if (!task.childTasks?.length) {
    return task;
  }

  return {
    ...task,
    subtasks: task.childTasks.map((childTask) => ({
      assignee: childTask.assignee,
      done: childTask.status === "done",
      id: childTask.id,
      status: getPlanChildStatus(childTask.status),
      title: childTask.title,
    })),
  };
}

const TaskCard = ({
  task,
  onTaskClick,
}: {
  task: KanbanTask;
  onTaskClick: (task: KanbanTask) => void;
}) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onTaskClick(task);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTaskClick(task)}
      onKeyDown={handleKeyDown}
      data-task-card
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900/80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="line-clamp-2 text-sm leading-snug font-semibold text-slate-950 dark:text-slate-50"
            title={task.title}
          >
            {task.title}
          </h3>
          {task.description ? (
            <p
              className="mt-2 line-clamp-1 text-xs leading-5 text-slate-600 dark:text-slate-300"
              title={task.description}
            >
              {task.description}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase",
            priorityBadgeStyles[task.priority],
          )}
        >
          {getPriorityLabel(task.priority)}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200/80 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="truncate" title={task.assignee ? task.assignee : "Unassigned"}>
          {task.assignee ? task.assignee : "Unassigned"}
        </span>
        <div className="flex items-center gap-3">
          {task.subtasks.length > 0 ? (
            <span>
              {task.subtasks.length} subtask{task.subtasks.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {task.documentCount && task.documentCount > 0 ? (
            <span>
              {task.documentCount} doc{task.documentCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const KanbanColumn = ({ column, onTaskClick }: KanbanColumnProps) => {
  const variant = columnVariants[column.variant];
  const IconComponent = columnIconComponents[column.variant];

  return (
    <div
      className={cn(
        "flex h-full min-w-48 flex-1 flex-col rounded-lg p-2",
        variant.column,
      )}
    >
      {/* Header */}
      <div className="mb-2 flex w-full items-center gap-2">
        <IconComponent
          className={cn("h-4 w-4", variant.icon)}
          strokeWidth={2}
        />
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            variant.badge,
          )}
        >
          {column.title}
        </span>
        <span className="text-muted-foreground ml-auto text-sm font-medium">
          {column.tasks.length}
        </span>
      </div>

      {/* Task list */}
      <ScrollArea className="min-h-0 flex-1">
        {column.tasks.length === 0 ? (
          <EmptyState variant={column.variant} />
        ) : (
          <div className="space-y-2">
            {column.tasks.map((task) => (
              task.childTasks?.length ? (
                <PlanCard
                  key={task.id}
                  task={buildPlanCardTask(task)}
                  onTaskClick={onTaskClick}
                />
              ) : (
                <TaskCard key={task.id} task={task} onTaskClick={onTaskClick} />
              )
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
