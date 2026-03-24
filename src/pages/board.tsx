import React from "react";
import { Bell } from "lucide-react";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import {
  getNewTaskDialogPlanOptions,
  NewTaskDialog,
} from "@/components/kanban/new-task-dialog";
import {
  type ColumnVariant,
  type KanbanColumnDef,
  type TaskArtifact,
  type KanbanTask,
  type TaskSource,
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
import { useAgents } from "@/hooks/useAgents";
import { useTasks } from "@/hooks/useTasks";
import type { Task, TaskPriority, TaskRecord, TaskStatus } from "@/lib/types";
import { useDrawer } from "@/providers/drawer-provider";
import { cn } from "@/lib/utils";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getTaskSource(metadata: Record<string, unknown> | null): TaskSource {
  const source = getRecordString(metadata, "source");
  if (source === "session") return "session";
  if (source === "agent-work-queue") return "work_queue";
  return "manual";
}

function getTaskStartedAt(metadata: Record<string, unknown> | null): number | undefined {
  const startedAt = metadata?.startedAt;
  if (typeof startedAt === "number" && Number.isFinite(startedAt)) return startedAt;
  return undefined;
}

function getTaskSessionKey(metadata: Record<string, unknown> | null): string | undefined {
  return getRecordString(metadata, "sessionKey");
}

function isTaskArtifact(value: unknown): value is TaskArtifact {
  return (
    isRecord(value) &&
    (value.type === "file" || value.type === "url") &&
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    typeof value.value === "string" &&
    value.value.trim().length > 0
  );
}

function getTaskArtifacts(metadata: Record<string, unknown> | null): TaskArtifact[] {
  if (!Array.isArray(metadata?.artifacts)) {
    return [];
  }

  return metadata.artifacts.filter(isTaskArtifact);
}

export function getTaskRuntimeDetails(task: Pick<TaskRecord, "metadata">) {
  const metadata = isRecord(task.metadata) ? task.metadata : null;
  const workQueue = isRecord(metadata?.work_queue) ? metadata.work_queue : null;

  return {
    loopManager:
      getRecordString(workQueue, "loop_manager") ??
      getRecordString(metadata, "loop_manager"),
    sessionKey: getTaskSessionKey(metadata),
    source: getTaskSource(metadata),
    startedAt: getTaskStartedAt(metadata),
    tmuxSession:
      getRecordString(workQueue, "tmux_session") ??
      getRecordString(metadata, "tmux_session"),
  };
}

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

function mapTaskRecordToKanbanTask(task: TaskRecord): KanbanTask {
  const metadata = isRecord(task.metadata) ? task.metadata : null;
  const runtime = getTaskRuntimeDetails(task);

  return {
    assignee: task.assignee_agent_id ?? undefined,
    artifacts: getTaskArtifacts(metadata),
    description: task.description ?? undefined,
    id: task.id,
    loopManager: runtime.loopManager,
    parentTaskId: task.parent_task_id ?? undefined,
    priority: mapTaskPriority(task.priority),
    sessionKey: runtime.sessionKey,
    source: runtime.source,
    startedAt: runtime.startedAt,
    status: task.status,
    subtasks: [],
    title: task.title,
    tmuxSession: runtime.tmuxSession,
  };
}

export function mapTaskToKanbanTask(task: Task): KanbanTask {
  const metadata = isRecord(task.metadata) ? task.metadata : null;
  const runtime = getTaskRuntimeDetails(task);

  return {
    assignee: task.assignee_agent_id ?? undefined,
    artifacts: getTaskArtifacts(metadata),
    childTasks: task.children?.map(mapTaskRecordToKanbanTask),
    description: task.description ?? undefined,
    id: task.id,
    loopManager: runtime.loopManager,
    parentTaskId: task.parent_task_id ?? undefined,
    priority: mapTaskPriority(task.priority),
    sessionKey: runtime.sessionKey,
    source: runtime.source,
    startedAt: runtime.startedAt,
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
    tmuxSession: runtime.tmuxSession,
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

type FilterType = "all" | "live" | "manual" | string;

function getUniqueAgents(tasks: Task[]): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  for (const task of tasks) {
    if (task.assignee_agent_id && !seen.has(task.assignee_agent_id)) {
      seen.set(task.assignee_agent_id, task.assignee_agent_id);
    }
  }
  return Array.from(seen, ([id, label]) => ({ id, label }));
}

function filterBoardTasks(tasks: Task[], filter: FilterType): Task[] {
  if (filter === "all") return tasks;
  if (filter === "live") {
    return tasks.filter((task) => {
      const meta = isRecord(task.metadata) ? task.metadata : null;
      return getRecordString(meta, "source") === "session";
    });
  }
  if (filter === "manual") {
    return tasks.filter((task) => {
      const meta = isRecord(task.metadata) ? task.metadata : null;
      const source = getRecordString(meta, "source");
      return source !== "session" && source !== "agent-work-queue";
    });
  }
  // Agent filter: filter is the agent id
  return tasks.filter((task) => task.assignee_agent_id === filter);
}

const FILTER_CHIPS: Array<{ id: FilterType; label: string }> = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "manual", label: "Manual" },
];

const BoardPage = () => {
  const { boardTasks, error, isLoading, tasks } = useTasks();
  const { agents } = useAgents();
  const { openDrawer } = useDrawer();
  const [filter, setFilter] = React.useState<FilterType>("all");

  const agentFilters = React.useMemo(() => getUniqueAgents(boardTasks), [boardTasks]);

  const filteredTasks = React.useMemo(
    () => filterBoardTasks(boardTasks, filter),
    [boardTasks, filter],
  );

  const columns = React.useMemo(() => buildBoardColumns(filteredTasks), [filteredTasks]);
  const planOptions = React.useMemo(() => getNewTaskDialogPlanOptions(tasks), [tasks]);

  const getAgentLabel = React.useCallback(
    (agentId: string) => {
      const agent = agents.find((a) => a.id === agentId);
      return agent ? `${agent.emoji} ${agent.name}` : agentId;
    },
    [agents],
  );

  const handleOpenFeed = React.useCallback(() => {
    openDrawer(<LiveFeed className="h-full" />, <LiveFeedTitle />);
  }, [openDrawer]);

  return (
    <>
      <PageHeader>
        <PageHeaderRow>
          <PageHeaderTitle>Board</PageHeaderTitle>
          <PageHeaderActions>
            <NewTaskDialog plans={planOptions} />
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
          {/* Filter chips */}
          <div className="-mx-4 mb-4 overflow-x-auto px-4">
            <div className="flex items-center gap-2">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilter(chip.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === chip.id
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800",
                  )}
                >
                  {chip.label}
                </button>
              ))}
              {agentFilters.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setFilter(agent.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === agent.id
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800",
                  )}
                >
                  {getAgentLabel(agent.id)}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between gap-4 text-sm">
            <p className="text-muted-foreground">
              {isLoading && tasks.length === 0
                ? "Loading tasks..."
                : filteredTasks.length === 0
                  ? filter === "all"
                    ? "No tasks yet. Create one to populate the board."
                    : "No tasks match this filter."
                  : `${filteredTasks.length} task${filteredTasks.length === 1 ? "" : "s"} on the board.`}
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
