import React from "react";
// @ts-expect-error lucide-react type export mismatch (works at runtime)
import { Activity, ClipboardList, Clock3, X } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import type { Activity as AgentActivity, Agent, AgentSession, TaskRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AgentDetailData = {
  activities: AgentActivity[];
  sessions: AgentSession[];
  tasks: TaskRecord[];
};

type AgentDetailApi = {
  getAgentDetail(agentId: string): Promise<AgentDetailData>;
};

type AgentDetailDrawerProps = {
  agent: Agent | null;
  api?: AgentDetailApi;
  initialData?: AgentDetailData;
  onClose: () => void;
  open: boolean;
};

type AgentDetailState = {
  data: AgentDetailData;
  error: Error | null;
  isLoading: boolean;
};

const EMPTY_DETAIL_DATA: AgentDetailData = {
  activities: [],
  sessions: [],
  tasks: [],
};
const defaultAgentDetailApi = createAgentDetailApi();

const TASK_STATUS_LABELS: Record<TaskRecord["status"], string> = {
  assigned: "Assigned",
  done: "Done",
  inbox: "Inbox",
  in_progress: "In progress",
  review: "Review",
};

function createAgentDetailApi(): AgentDetailApi {
  return {
    async getAgentDetail(agentId) {
      return (
        (await apiGet<AgentDetailData>(`/api/agents/${encodeURIComponent(agentId)}/detail`)) ??
        EMPTY_DETAIL_DATA
      );
    },
  };
}

function getInitialState(initialData?: AgentDetailData): AgentDetailState {
  return {
    data: initialData ?? EMPTY_DETAIL_DATA,
    error: null,
    isLoading: initialData === undefined,
  };
}

function formatRelativeTime(timestamp?: number | null) {
  if (!timestamp) {
    return "Never";
  }

  const minutes = Math.floor((Date.now() - timestamp) / 60_000);

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return new Date(timestamp).toLocaleDateString();
}

function getTaskBadgeVariant(status: TaskRecord["status"]): "default" | "outline" | "secondary" {
  switch (status) {
    case "done":
      return "secondary";
    case "review":
      return "default";
    default:
      return "outline";
  }
}

export const AgentDetailDrawer = ({
  agent,
  api = defaultAgentDetailApi,
  initialData,
  onClose,
  open,
}: AgentDetailDrawerProps) => {
  const [state, setState] = React.useState<AgentDetailState>(() => getInitialState(initialData));

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  React.useEffect(() => {
    if (!open || !agent) {
      return;
    }

    let cancelled = false;

    setState((current) => ({
      data:
        initialData && current.data === EMPTY_DETAIL_DATA
          ? initialData
          : current.data.activities.length > 0 ||
              current.data.sessions.length > 0 ||
              current.data.tasks.length > 0
            ? current.data
            : EMPTY_DETAIL_DATA,
      error: null,
      isLoading: true,
    }));

    void api
      .getAgentDetail(agent.id)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setState({
          data,
          error: null,
          isLoading: false,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          data: EMPTY_DETAIL_DATA,
          error: error instanceof Error ? error : new Error(String(error)),
          isLoading: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [agent, api, initialData, open]);

  React.useEffect(() => {
    setState(getInitialState(initialData));
  }, [initialData, agent?.id]);

  if (!open || !agent) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <button
        aria-label="Close agent details"
        className="pointer-events-auto absolute inset-0 bg-slate-950/10 backdrop-blur-[1px]"
        onClick={onClose}
        type="button"
      />

      <aside
        aria-label={`${agent.name} details`}
        aria-modal="true"
        className="bg-background pointer-events-auto absolute top-0 right-0 bottom-0 flex w-full max-w-xl flex-col border-l shadow-2xl"
        role="dialog"
      >
        <header className="border-b border-slate-200 bg-gradient-to-b from-slate-50 via-white to-white px-5 py-4 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl leading-none">{agent.emoji}</span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold tracking-tight">
                    {agent.name}
                  </h2>
                  <p className="text-muted-foreground text-sm">{agent.role}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <SummaryPill icon={Clock3} label="Last seen" value={formatRelativeTime(agent.lastHeartbeat)} />
                <SummaryPill
                  icon={ClipboardList}
                  label="Current work"
                  value={agent.currentTask?.title ?? agent.currentActivity ?? "Idle"}
                />
                <SummaryPill
                  icon={Activity}
                  label="Primary session"
                  value={agent.sessionKey ?? "Unavailable"}
                />
              </div>
            </div>

            <Button
              aria-label="Close agent details"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3 border-b px-5 py-4">
          <MetricCard label="Sessions" value={state.data.sessions.length} />
          <MetricCard label="Tasks" value={state.data.tasks.length} />
          <MetricCard label="Activity" value={state.data.activities.length} />
        </div>

        {state.error ? (
          <div className="px-5 py-4">
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {state.error.message}
            </div>
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1 px-5 py-4">
          <div className="space-y-6 pr-3">
            <DrawerSection title="Sessions">
              {state.isLoading ? (
                <LoadingList />
              ) : state.data.sessions.length === 0 ? (
                <DrawerEmpty
                  description="No live sessions are currently attached to this agent."
                  title="No sessions"
                />
              ) : (
                <div className="space-y-3">
                  {state.data.sessions.map((session) => (
                    <section
                      key={String(session.sessionKey ?? session.currentActivity ?? "session")}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {session.sessionKey ?? "Unnamed session"}
                          </p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            {session.currentActivity ?? "No current activity"}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {formatRelativeTime(session.lastHeartbeat)}
                        </Badge>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </DrawerSection>

            <DrawerSection title="Tasks">
              {state.isLoading ? (
                <LoadingList />
              ) : state.data.tasks.length === 0 ? (
                <DrawerEmpty
                  description="No assigned tasks are currently tracked for this agent."
                  title="No tasks"
                />
              ) : (
                <div className="space-y-3">
                  {state.data.tasks.map((task) => (
                    <section
                      key={task.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium">{task.title}</p>
                          <p className="text-muted-foreground text-xs">
                            Updated {formatRelativeTime(task.updated_at)}
                          </p>
                        </div>
                        <Badge variant={getTaskBadgeVariant(task.status)}>
                          {TASK_STATUS_LABELS[task.status]}
                        </Badge>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </DrawerSection>

            <DrawerSection title="Activity">
              {state.isLoading ? (
                <LoadingList />
              ) : state.data.activities.length === 0 ? (
                <DrawerEmpty
                  description="No recent activity has been recorded for this agent."
                  title="No activity"
                />
              ) : (
                <div className="space-y-3">
                  {state.data.activities.map((activity) => (
                    <section
                      key={activity.id}
                      className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium">{activity.message}</p>
                          <p className="text-muted-foreground text-xs">
                            {activity.type}
                          </p>
                        </div>
                        <Badge className="max-w-24 truncate" variant="outline">
                          {formatRelativeTime(activity.created_at)}
                        </Badge>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </DrawerSection>
          </div>
        </ScrollArea>
      </aside>
    </div>
  );
};

const SummaryPill = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) => {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/70">
      <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
};

const MetricCard = ({ label, value }: { label: string; value: number }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
};

const DrawerSection = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
};

const DrawerEmpty = ({
  description,
  title,
}: {
  description: string;
  title: string;
}) => {
  return (
    <Empty className="h-full rounded-2xl border-slate-200 dark:border-slate-800">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardList className="h-5 w-5" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
};

const LoadingList = () => {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={cn(
            "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950",
          )}
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
};
