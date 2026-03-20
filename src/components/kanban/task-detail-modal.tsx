"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@clawe/backend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@clawe/ui/components/dialog";
import { Button } from "@clawe/ui/components/button";
import { Textarea } from "@clawe/ui/components/textarea";
import { cn } from "@clawe/ui/lib/utils";
import {
  Circle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ThumbsUp,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Id } from "@clawe/backend/dataModel";
import type { KanbanTask } from "./types";
import type { DocumentWithCreator } from "@clawe/backend/types";
import { DocumentsSection } from "./_components/documents-section";
import { DocumentViewerModal } from "./_components/document-viewer-modal";

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

export const TaskDetailModal = ({
  task,
  open,
  onOpenChange,
}: TaskDetailModalProps) => {
  const [selectedDocument, setSelectedDocument] =
    useState<DocumentWithCreator | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(true);
  const [docsShowAll, setDocsShowAll] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const approve = useMutation(api.tasks.approve);
  const requestChanges = useMutation(api.tasks.requestChanges);

  if (!task) return null;

  const priority = priorityConfig[task.priority];
  const hasSubtasks = task.subtasks.length > 0;
  const isReview = task.status === "review";
  const doneCount = task.subtasks.filter((st) => st.done).length;
  const totalCount = task.subtasks.length;
  const progressPercent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await approve({
        taskId: task.id as Id<"tasks">,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);
    try {
      await requestChanges({
        taskId: task.id as Id<"tasks">,
        feedback: feedback.trim(),
      });
      setFeedback("");
      setShowFeedback(false);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setShowFeedback(false);
      setFeedback("");
    }
    onOpenChange(open);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl leading-tight">
              {task.title}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
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

            {/* Documents section */}
            <DocumentsSection
              taskId={task.id}
              onViewDocument={setSelectedDocument}
              open={docsOpen}
              onToggle={() => setDocsOpen(!docsOpen)}
              maxVisible={docsShowAll ? undefined : 2}
              onShowAll={() => setDocsShowAll(true)}
            />

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
        </DialogContent>
      </Dialog>

      {/* Document viewer modal */}
      <DocumentViewerModal
        document={selectedDocument}
        open={selectedDocument !== null}
        onOpenChange={(isOpen) => !isOpen && setSelectedDocument(null)}
      />
    </>
  );
};
