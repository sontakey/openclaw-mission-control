"use client";

import { useQuery } from "convex/react";
import { api } from "@clawe/backend";
import type { Id } from "@clawe/backend/dataModel";
import type { DocumentWithCreator } from "@clawe/backend/types";
import { FileText, Eye, ChevronDown, ChevronRight } from "lucide-react";

function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export type DocumentsSectionProps = {
  taskId: string;
  onViewDocument: (doc: DocumentWithCreator) => void;
  open?: boolean;
  onToggle?: () => void;
  maxVisible?: number;
  onShowAll?: () => void;
};

export const DocumentsSection = ({
  taskId,
  onViewDocument,
  open = true,
  onToggle,
  maxVisible,
  onShowAll,
}: DocumentsSectionProps) => {
  const documents = useQuery(api.documents.getForTask, {
    taskId: taskId as Id<"tasks">,
  });

  // Filter to only show deliverables, sorted newest first
  const deliverables = (
    documents?.filter((d) => d.type === "deliverable") ?? []
  ).sort((a, b) => b.createdAt - a.createdAt);

  if (deliverables.length === 0) {
    return null;
  }

  return (
    <div>
      <button
        type="button"
        className="mb-3 flex w-full items-center gap-1.5"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        )}
        <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Deliverables ({deliverables.length})
        </h4>
      </button>
      {open && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(maxVisible
              ? deliverables.slice(0, maxVisible)
              : deliverables
            ).map((doc) => {
              const creatorLabel = doc.creator
                ? `${doc.creator.emoji || ""} ${doc.creator.name}`.trim()
                : null;

              return (
                <div
                  key={doc._id}
                  className="group relative cursor-pointer rounded-lg border border-gray-200 bg-white p-2.5 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                  onClick={() => onViewDocument(doc)}
                >
                  {/* Icon + Title + Meta */}
                  <div className="flex items-center gap-2">
                    <div className="shrink-0 rounded bg-gray-100 p-1.5 dark:bg-zinc-800">
                      <FileText className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {doc.title}
                      </p>
                      <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                        {creatorLabel ? `by ${creatorLabel}` : ""}
                        {creatorLabel ? " · " : ""}
                        {timeAgo(doc.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* View overlay on hover */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/5 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-white/5">
                    <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm dark:bg-zinc-800 dark:text-gray-200">
                      <Eye className="h-3 w-3" />
                      View
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {maxVisible && deliverables.length > maxVisible && (
            <button
              type="button"
              className="mt-2 w-full text-center text-xs font-medium text-gray-900 hover:text-gray-700 dark:text-gray-100 dark:hover:text-gray-300"
              onClick={onShowAll}
            >
              Show all ({deliverables.length})
            </button>
          )}
        </>
      )}
    </div>
  );
};
