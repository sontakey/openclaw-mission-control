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
  type TaskSource,
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

const SOURCE_BADGES: Record<TaskSource, { emoji: string; label: string }> = {
  session: { emoji: "\u{1F504}", label: "Live session" },
  work_queue: { emoji: "\u{1F4CB}", label: "Work queue" },
  manual: { emoji: "\u{270B}", label: "Manual" },
};

function formatElapsed(startedAt: number): string {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs < 0) return "0s";
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function useElapsedTime(startedAt: number | undefined, isActive: boolean) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!startedAt || !isActive) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [startedAt, isActive]);
  if (!startedAt) return null;
  return formatElapsed(startedAt);
}

const SourceBadge = ({ source }: { source?: TaskSource }) => {
  if (!source) return null;
  const badge = SOURCE_BADGES[source];
  return (
    <span
      className="absolute -top-1 -right-1 z-10 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-white text-[8px] sm:text-[10px] leading-none shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
      title={badge.label}
    >
      {badge.emoji}
    </span>
  );
};

const PulseDot = () => (
  <span className="relative mr-1.5 inline-flex h-2 w-2 shrink-0">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
  </span>
);

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

  const isSessionTask = task.source === "session";
  const isActive = task.status === "in_progress";
  const elapsed = useElapsedTime(task.startedAt, isSessionTask && isActive);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTaskClick(task)}
      onKeyDown={handleKeyDown}
      data-task-card
      data-task-source={task.source}
      className={cn(
        "task-card-animate relative cursor-pointer rounded-lg border bg-white p-2.5 sm:p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-slate-50/80 dark:bg-slate-950 dark:hover:bg-slate-900/80",
        isSessionTask && isActive
          ? "border-emerald-300 dark:border-emerald-800"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700",
      )}
    >
      <SourceBadge source={task.source} />

      <div className="flex items-start justify-between gap-1.5 sm:gap-3">
        <div className="min-w-0">
          {isSessionTask && isActive ? (
            <div className="mb-0.5 sm:mb-1.5 flex items-center text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <PulseDot />
              <span>Live{elapsed ? ` \u00b7 ${elapsed}` : ""}</span>
            </div>
          ) : null}
          <h3
            className="line-clamp-2 text-[15px] sm:text-sm leading-snug font-semibold text-slate-950 dark:text-slate-50"
            title={task.title}
          >
            {task.title}
          </h3>
          {task.description ? (
            <p
              className="mt-1 sm:mt-2 line-clamp-1 text-[11px] sm:text-xs leading-4 sm:leading-5 text-slate-500 dark:text-slate-400"
              title={task.description}
            >
              {task.description}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            "hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase sm:inline-flex",
            priorityBadgeStyles[task.priority],
          )}
        >
          {getPriorityLabel(task.priority)}
        </span>
      </div>

      <div className="mt-2 sm:mt-4 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-2 sm:pt-3 text-[11px] sm:text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="truncate font-medium" title={task.assignee ? task.assignee : "Unassigned"}>
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
