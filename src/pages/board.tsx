import React from "react";
import { AlertTriangle, Bell } from "lucide-react";

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
import type { Agent } from "@/lib/types";
import { BoardAgentStatusList } from "@/components/agents/board-agent-status-list";

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

const REVIEW_STALE_THRESHOLD_SECONDS = 2 * 60 * 60;

export function getBoardSummaryStats({
  agents,
  now = Date.now(),
  tasks,
}: {
  agents: Agent[];
  now?: number;
  tasks: Task[];
}) {
  const completedSince = Math.floor(now / 1000) - 24 * 60 * 60;

  return {
    activeAgents: agents.filter((agent) => agent.status === "online").length,
    completed24h: tasks.filter(
      (task) =>
        task.status === "done" &&
        task.completed_at !== null &&
        task.completed_at >= completedSince,
    ).length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    inReview: tasks.filter((task) => task.status === "review").length,
  };
}

export type BoardAttentionItem = {
  id: string;
  label: string;
  note: string;
  severity: "amber" | "red";
  title: string;
};

function getAttentionItemLabelClasses(severity: BoardAttentionItem["severity"]) {
  return severity === "red"
    ? "border-red-200 bg-red-100 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
    : "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
}

export function getBoardAttentionItems({
  now = Date.now(),
  tasks,
}: {
  now?: number;
  tasks: Task[];
}): BoardAttentionItem[] {
  const nowSeconds = Math.floor(now / 1000);

  return tasks
    .reduce<BoardAttentionItem[]>((items, task) => {
      const metadata = isRecord(task.metadata) ? task.metadata : null;
      const workQueue = isRecord(metadata?.work_queue) ? metadata.work_queue : null;
      const workQueueStatus = getRecordString(workQueue, "status");
      const workQueueId = getRecordString(metadata, "work_queue_id");

      if (getTaskSource(metadata) === "work_queue" && workQueueStatus === "failed") {
        items.push({
          id: task.id,
          label: "Failed Queue",
          note: workQueueId
            ? `Work queue item ${workQueueId} reported a failure.`
            : "Work queue sync reported a failure.",
          severity: "red",
          title: task.title,
        });

        return items;
      }

      if (
        task.status === "review" &&
        nowSeconds - task.updated_at > REVIEW_STALE_THRESHOLD_SECONDS
      ) {
        items.push({
          id: task.id,
          label: "Review >2h",
          note: "Task has been waiting in review for more than 2 hours.",
          severity: "amber",
          title: task.title,
        });
      }

      return items;
    }, [])
    .sort((left, right) => {
      if (left.severity !== right.severity) {
        return left.severity === "red" ? -1 : 1;
      }

      return left.title.localeCompare(right.title);
    });
}

export function BoardAttentionNeededSection({
  items,
}: {
  items: BoardAttentionItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/80 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="border-b border-amber-200 px-4 py-4 dark:border-amber-900/60">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            Attention Needed
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Stuck review work and failed queue items that need a follow-up.
        </p>
      </div>

      <ul className="divide-y divide-amber-200/80 dark:divide-amber-900/40">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 px-4 py-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-950 dark:text-slate-50">
                {item.title}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {item.note}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium",
                getAttentionItemLabelClasses(item.severity),
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
  const summaryStats = React.useMemo(
    () => getBoardSummaryStats({ agents, tasks }),
    [agents, tasks],
  );
  const attentionItems = React.useMemo(
    () => getBoardAttentionItems({ tasks }),
    [tasks],
  );

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

        <section
          aria-label="Board summary"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {[
            {
              description: "Currently online and reporting into Mission Control.",
              label: "Active Agents",
              value: summaryStats.activeAgents,
            },
            {
              description: "Tasks actively being worked right now.",
              label: "In Progress",
              value: summaryStats.inProgress,
            },
            {
              description: "Tasks waiting on review or approval.",
              label: "In Review",
              value: summaryStats.inReview,
            },
            {
              description: "Tasks marked done in the last 24 hours.",
              label: "Completed 24h",
              value: summaryStats.completed24h,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
            >
              <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                {stat.label}
              </p>
              <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {stat.description}
              </p>
            </div>
          ))}
        </section>

        {error ? (
          <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error.message}
          </section>
        ) : null}

        <BoardAttentionNeededSection items={attentionItems} />

        <BoardAgentStatusList agents={agents} />

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  Recent Activity
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Latest 10 updates from the mission feed.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleOpenFeed}>
                <Bell className="h-4 w-4" />
                Open Full Feed
              </Button>
            </div>
          </div>
          <div className="h-[26rem]">
            <LiveFeed className="h-full" limit={10} />
          </div>
        </section>

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
