import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Circle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ThumbsUp,
  Pencil,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
} from "lucide-react";

import { useTaskTmuxOutput } from "@/hooks/useTaskTmuxOutput";
import { useTaskPrd } from "@/hooks/useTaskPrd";

import type { KanbanTask, TaskArtifact } from "./types";
import { TaskPrdMarkdown } from "./task-prd-markdown";
import {
  approveKanbanTask,
  requestKanbanTaskChanges,
} from "./task-actions";

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

const priorityConfig: Record<
  KanbanTask["priority"],
  { label: string; className: string }
> = {
  high: {
    label: "High",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
  medium: {
    label: "Medium",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  low: {
    label: "Low",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  },
};

export type TaskDetailModalProps = {
  task: KanbanTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type TaskDetailModalBodyProps = {
  task: KanbanTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type TaskTmuxOutputPanelProps = {
  capturedAt?: number | null;
  error?: string | null;
  isLoading?: boolean;
  loopManager?: string;
  output?: string | null;
  session: string;
  status?: KanbanTask["status"];
};

type TaskPrdPanelProps = {
  content?: string | null;
  error?: string | null;
  exists?: boolean;
  isLoading?: boolean;
  path?: string | null;
};

function isMarkdownArtifact(artifact: TaskArtifact) {
  return artifact.type === "file" && artifact.value.toLowerCase().endsWith(".md");
}

function getArtifactActionLabel(artifact: TaskArtifact) {
  if (artifact.type === "url") {
    return "Open";
  }

  if (isMarkdownArtifact(artifact)) {
    return "View PRD";
  }

  return "Copy path";
}

function getArtifactIcon(artifact: TaskArtifact) {
  if (artifact.type === "url") {
    return <ExternalLink className="h-4 w-4 text-blue-500" />;
  }

  if (artifact.label.toLowerCase().includes("directory")) {
    return <Folder className="h-4 w-4 text-amber-500" />;
  }

  return <FileText className="h-4 w-4 text-slate-500" />;
}

export function TaskTmuxOutputPanel({
  capturedAt = null,
  error = null,
  isLoading = false,
  loopManager,
  output = null,
  session,
  status,
}: TaskTmuxOutputPanelProps) {
  const isRunningLoop = status === "in_progress";

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {isRunningLoop ? "Live tmux output" : "Tmux output"}
          </h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {loopManager ? `${loopManager} loop` : "Session"} · {session}
          </p>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {capturedAt
            ? `Updated ${timeAgo(capturedAt)}`
            : isLoading
              ? "Connecting"
              : "Waiting"}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner">
        {error ? (
          <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">Session ended — no live output available.</div>
        ) : output ? (
          <pre className="max-h-72 overflow-auto px-4 py-3 font-mono text-xs leading-5 whitespace-pre-wrap text-slate-100">
            {output}
          </pre>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-400">
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span>
              {isLoading
                ? "Connecting to tmux session..."
                : "No tmux output captured yet."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskPrdPanel({
  content = null,
  error = null,
  exists = false,
  isLoading = false,
  path = null,
}: TaskPrdPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Product requirements document
        </h4>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {path ? path : "Markdown file linked to this task"}
        </p>
      </div>

      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading PRD...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          Failed to load PRD. {error}
        </div>
      ) : !exists ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
          No PRD linked to this task.
        </div>
      ) : !content || content.trim().length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
          The linked PRD file is empty.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/20">
          <TaskPrdMarkdown content={content} />
        </div>
      )}
    </div>
  );
}

export const TaskDetailModal = ({
  task,
  open,
  onOpenChange,
}: TaskDetailModalProps) => {
  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl leading-tight">
            {task.title}
          </DialogTitle>
        </DialogHeader>
        <TaskDetailModalBody
          open={open}
          onOpenChange={onOpenChange}
          task={task}
        />
      </DialogContent>
    </Dialog>
  );
};

export const TaskDetailModalBody = ({
  task,
  open,
  onOpenChange,
}: TaskDetailModalBodyProps) => {
  const [activeTab, setActiveTab] = useState<"overview" | "prd">("overview");
  const [artifactsOpen, setArtifactsOpen] = useState(
    (task.artifacts?.length ?? 0) > 0,
  );
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const artifacts = task.artifacts ?? [];
  const hasArtifacts = artifacts.length > 0;

  const {
    data: tmuxOutput,
    error: tmuxOutputError,
    isLoading: isTmuxOutputLoading,
  } = useTaskTmuxOutput({
    enabled: open && Boolean(task?.tmuxSession),
    taskId: task?.id ?? "",
  });
  const {
    data: prd,
    error: prdError,
    isLoading: isPrdLoading,
  } = useTaskPrd({
    enabled: open && activeTab === "prd" && Boolean(task?.id),
    open,
    taskId: task?.id ?? "",
  });

  useEffect(() => {
    if (open) {
      setActiveTab("overview");
    }
  }, [open, task.id]);

  useEffect(() => {
    if (!open) {
      setShowFeedback(false);
      setFeedback("");
      setActiveTab("overview");
    }
  }, [open]);

  useEffect(() => {
    setArtifactsOpen(hasArtifacts);
  }, [hasArtifacts, open, task.id]);

  const priority = priorityConfig[task.priority];
  const hasSubtasks = task.subtasks.length > 0;
  const isReview = task.status === "review";
  const doneCount = task.subtasks.filter((st) => st.done).length;
  const totalCount = task.subtasks.length;
  const progressPercent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  const handleArtifactClick = (artifact: TaskArtifact) => {
    if (isMarkdownArtifact(artifact)) {
      setActiveTab("prd");
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(artifact.value);
    }
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await approveKanbanTask(task.id);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);
    try {
      await requestKanbanTaskChanges(task.id, feedback);
      setFeedback("");
      setShowFeedback(false);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Tabs
        className="min-h-0 flex-1"
        onValueChange={(value) => setActiveTab(value as "overview" | "prd")}
        value={activeTab}
      >
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger className="flex-none px-3" value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger className="flex-none px-3" value="prd">
            PRD
          </TabsTrigger>
        </TabsList>

        <TabsContent
          forceMount
          value="overview"
          className="min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <div className="space-y-5">
            {/* Priority & Assignee row */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  priority.className,
                )}
              >
                {priority.label}
              </span>
              {task.assignee && (
                <span className="text-muted-foreground text-xs">
                  Assigned to {task.assignee}
                </span>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <div>
                <h4 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                  Description
                </h4>
                <p
                  className={cn(
                    "text-sm leading-relaxed text-gray-700 dark:text-gray-300",
                    !descExpanded && "line-clamp-2",
                  )}
                >
                  {task.description}
                </p>
                {task.description.length > 120 && (
                  <button
                    type="button"
                    className="mt-1 text-xs font-medium text-gray-900 hover:text-gray-700 dark:text-gray-100 dark:hover:text-gray-300"
                    onClick={() => setDescExpanded(!descExpanded)}
                  >
                    {descExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            )}

            <div>
              <button
                type="button"
                className="mb-2 flex w-full items-center justify-between"
                onClick={() => setArtifactsOpen(!artifactsOpen)}
              >
                <div className="flex items-center gap-1.5">
                  {artifactsOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  )}
                  <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Artifacts
                  </h4>
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {hasArtifacts
                    ? `${artifacts.length} item${artifacts.length === 1 ? "" : "s"}`
                    : "No artifacts yet"}
                </span>
              </button>

              {artifactsOpen ? (
                hasArtifacts ? (
                  <ul className="space-y-2">
                    {artifacts.map((artifact) => {
                      const content = (
                        <>
                          <span className="shrink-0">{getArtifactIcon(artifact)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                              {artifact.label}
                            </span>
                            <span className="block truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                              {artifact.value}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
                            {getArtifactActionLabel(artifact)}
                          </span>
                        </>
                      );

                      return (
                        <li key={`${artifact.type}-${artifact.label}-${artifact.value}`}>
                          {artifact.type === "url" ? (
                            <a
                              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/30 dark:hover:border-slate-700 dark:hover:bg-slate-950/50"
                              href={artifact.value}
                              rel="noreferrer noopener"
                              target="_blank"
                            >
                              {content}
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/30 dark:hover:border-slate-700 dark:hover:bg-slate-950/50"
                              onClick={() => handleArtifactClick(artifact)}
                            >
                              {content}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                    No artifacts yet
                  </div>
                )
              ) : null}
            </div>

            {task.tmuxSession ? (
              <TaskTmuxOutputPanel
                capturedAt={tmuxOutput?.capturedAt}
                error={tmuxOutputError?.message}
                isLoading={isTmuxOutputLoading}
                loopManager={task.loopManager}
                output={tmuxOutput?.output}
                session={task.tmuxSession}
                status={task.status}
              />
            ) : null}

            {/* Subtasks */}
            {hasSubtasks && (
              <div>
                <button
                  type="button"
                  className="mb-2 flex w-full items-center justify-between"
                  onClick={() => setSubtasksOpen(!subtasksOpen)}
                >
                  <div className="flex items-center gap-1.5">
                    {subtasksOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      Subtasks
                    </h4>
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {doneCount}/{totalCount} complete
                  </span>
                </button>

                {/* Progress bar (always visible) */}
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      progressPercent === 100 ? "bg-green-500" : "bg-blue-500",
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {subtasksOpen && (
                  <ul className="space-y-1">
                    {task.subtasks.map((subtask) => {
                      const status =
                        subtask.status ?? (subtask.done ? "done" : "pending");
                      return (
                        <li
                          key={subtask.id}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                            status === "done" && "text-muted-foreground",
                            status === "blocked" &&
                              "bg-red-50 dark:bg-red-950/20",
                            (status === "pending" ||
                              status === "in_progress") &&
                              "text-gray-800 dark:text-gray-200",
                          )}
                        >
                          <div className="shrink-0">
                            {status === "done" && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            {status === "in_progress" && (
                              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                            )}
                            {status === "blocked" && (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            )}
                            {status === "pending" && (
                              <Circle className="text-muted-foreground h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate",
                                status === "done" ? "line-through" : "",
                              )}
                            >
                              {subtask.title}
                            </span>
                            {status === "blocked" && subtask.blockedReason && (
                              <p className="mt-0.5 truncate text-xs text-red-600 dark:text-red-400">
                                {subtask.blockedReason}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right text-xs whitespace-nowrap text-gray-400 dark:text-gray-500">
                            {subtask.assignee && (
                              <span>{subtask.assignee}</span>
                            )}
                            {subtask.assignee && subtask.doneAt && (
                              <span> · </span>
                            )}
                            {subtask.doneAt && (
                              <span>{timeAgo(subtask.doneAt)}</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Review actions */}
            {isReview && (
              <div className="bg-muted/50 rounded-lg p-4">
                {!showFeedback ? (
                  <>
                    <p className="text-muted-foreground mb-3 text-sm font-medium">
                      What do you think?
                    </p>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/50"
                        onClick={handleApprove}
                        disabled={isSubmitting}
                      >
                        <ThumbsUp className="mr-2 h-4 w-4" />
                        Looks good!
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-amber-200 hover:border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/50"
                        onClick={() => setShowFeedback(true)}
                        disabled={isSubmitting}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Needs tweaks
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground mb-2 text-sm font-medium">
                      What needs to change?
                    </p>
                    <Textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Describe the changes needed..."
                      className="mb-3 min-h-[80px] resize-none"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowFeedback(false);
                          setFeedback("");
                        }}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleRequestChanges}
                        disabled={isSubmitting || !feedback.trim()}
                      >
                        Send feedback
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          forceMount
          value="prd"
          className="min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <TaskPrdPanel
            content={prd?.content}
            error={prdError?.message}
            exists={prd?.exists}
            isLoading={isPrdLoading}
            path={prd?.path}
          />
        </TabsContent>
      </Tabs>
    </>
  );
};
