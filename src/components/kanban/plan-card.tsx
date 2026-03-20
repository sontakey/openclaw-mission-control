import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { KanbanSubtask, KanbanTask } from "./types";

export type PlanCardProps = {
  task: KanbanTask;
  onTaskClick: (task: KanbanTask) => void;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

const priorityStyles: Record<
  KanbanTask["priority"],
  { badge: string; border: string; progress: string; shadow: string }
> = {
  high: {
    badge:
      "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-200",
    border: "border-l-orange-500",
    progress: "bg-orange-500",
    shadow:
      "shadow-[0_18px_40px_-32px_rgba(234,88,12,0.9)] dark:shadow-[0_18px_40px_-32px_rgba(249,115,22,0.85)]",
  },
  medium: {
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200",
    border: "border-l-sky-500",
    progress: "bg-sky-500",
    shadow:
      "shadow-[0_18px_40px_-32px_rgba(14,165,233,0.9)] dark:shadow-[0_18px_40px_-32px_rgba(56,189,248,0.85)]",
  },
  low: {
    badge:
      "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    border: "border-l-slate-500",
    progress: "bg-slate-500",
    shadow:
      "shadow-[0_18px_40px_-32px_rgba(71,85,105,0.9)] dark:shadow-[0_18px_40px_-32px_rgba(100,116,139,0.85)]",
  },
};

export function getPlanCardSubtaskStatus(
  subtask: KanbanSubtask,
): NonNullable<KanbanSubtask["status"]> {
  return subtask.status ?? (subtask.done ? "done" : "pending");
}

export function getPlanCardProgress(task: KanbanTask) {
  const totalCount = task.subtasks.length;
  const doneCount = task.subtasks.filter(
    (subtask) => getPlanCardSubtaskStatus(subtask) === "done",
  ).length;

  return {
    doneCount,
    percent: totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100),
    totalCount,
  };
}

export function getPlanCardAgents(task: KanbanTask): string[] {
  const agents = new Set<string>();

  if (task.assignee?.trim()) {
    agents.add(task.assignee.trim());
  }

  for (const subtask of task.subtasks) {
    if (subtask.assignee?.trim()) {
      agents.add(subtask.assignee.trim());
    }
  }

  return [...agents];
}

function getAgentInitials(agent: string) {
  const parts = agent
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "??";
  }

  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

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

export const PlanCard = ({
  task,
  onTaskClick,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
}: PlanCardProps) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = expanded ?? internalExpanded;
  const hasChildren = task.subtasks.length > 0;
  const tone = priorityStyles[task.priority];
  const { doneCount, percent, totalCount } = getPlanCardProgress(task);
  const agents = getPlanCardAgents(task);
  const visibleAgents = agents.slice(0, 3);
  const extraAgents = agents.length - visibleAgents.length;

  const setExpanded = (nextExpanded: boolean) => {
    if (expanded === undefined) {
      setInternalExpanded(nextExpanded);
    }
    onExpandedChange?.(nextExpanded);
  };

  const handleToggleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setExpanded(!isExpanded);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onTaskClick(task);
  };

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onTaskClick(task)}
        onKeyDown={handleCardKeyDown}
        data-plan-card
        className={cn(
          "cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900/80",
          "border-l-[6px]",
          tone.border,
          tone.shadow,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.28em] text-slate-500 uppercase dark:text-slate-400">
              Plan
            </p>
            <h3 className="mt-1 text-sm leading-snug font-semibold text-slate-950 dark:text-slate-50">
              {task.title}
            </h3>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase",
              tone.badge,
            )}
          >
            {getPriorityLabel(task.priority)}
          </span>
        </div>

        {task.description ? (
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {task.description}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
              <span>Progress</span>
              <span>
                {doneCount}/{totalCount} complete
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className={cn("h-full rounded-full transition-all", tone.progress)}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
            <div className="min-w-0">
              {agents.length > 0 ? (
                <>
                  <div
                    className="flex items-center"
                    aria-label={`${agents.length} agents assigned`}
                  >
                    {visibleAgents.map((agent, index) => (
                      <span
                        key={agent}
                        title={agent}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full border border-white bg-slate-900 text-[10px] font-semibold tracking-[0.18em] text-white dark:border-slate-950 dark:bg-slate-100 dark:text-slate-900",
                          index > 0 && "-ml-2",
                        )}
                      >
                        {getAgentInitials(agent)}
                      </span>
                    ))}
                    {extraAgents > 0 ? (
                      <span className="-ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white bg-white text-[10px] font-semibold tracking-[0.14em] text-slate-600 dark:border-slate-950 dark:bg-slate-900 dark:text-slate-200">
                        +{extraAgents}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {agents.length} agent{agents.length === 1 ? "" : "s"}
                  </p>
                </>
              ) : (
                <p className="text-xs font-medium tracking-[0.14em] text-slate-500 uppercase dark:text-slate-400">
                  Unassigned
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              {task.documentCount && task.documentCount > 0 ? (
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  {task.documentCount} doc{task.documentCount === 1 ? "" : "s"}
                </span>
              ) : null}

              {hasChildren ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleToggleClick}
                  aria-expanded={isExpanded}
                  className="h-auto px-2 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600 uppercase hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  {isExpanded ? "Hide children" : "Show children"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && hasChildren ? (
        <ul className="mt-2 ml-4 space-y-2" data-plan-card-children>
          {task.subtasks.map((subtask) => {
            const status = getPlanCardSubtaskStatus(subtask);

            return (
              <li
                key={subtask.id}
                className={cn(
                  "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/70",
                  status === "blocked" &&
                    "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    {status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : null}
                    {status === "in_progress" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                    ) : null}
                    {status === "blocked" ? (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    ) : null}
                    {status === "pending" ? (
                      <Circle className="h-4 w-4 text-slate-400" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "font-medium text-slate-800 dark:text-slate-100",
                        status === "done" && "line-through text-slate-500 dark:text-slate-400",
                      )}
                    >
                      {subtask.title}
                    </p>
                    {subtask.blockedReason ? (
                      <p className="mt-1 text-red-600 dark:text-red-300">
                        {subtask.blockedReason}
                      </p>
                    ) : null}
                  </div>
                  {subtask.assignee ? (
                    <span className="shrink-0 text-[11px] tracking-[0.14em] text-slate-500 uppercase dark:text-slate-400">
                      {subtask.assignee}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
