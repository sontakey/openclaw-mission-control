"use client";

import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@clawe/ui/components/dialog";
import { Button } from "@clawe/ui/components/button";
import { Download } from "lucide-react";
import { Spinner } from "@clawe/ui/components/spinner";
import { cn } from "@clawe/ui/lib/utils";
import type { DocumentWithCreator } from "@clawe/backend/types";

const VIEWER_HEIGHT = "h-[500px]";

/** Very simple markdown → HTML renderer for preview mode */
function renderMarkdown(md: string): string {
  const html = md
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers
    .replace(
      /^#### (.+)$/gm,
      '<h4 class="text-sm font-semibold mt-4 mb-1">$1</h4>',
    )
    .replace(
      /^### (.+)$/gm,
      '<h3 class="text-base font-semibold mt-5 mb-1.5">$1</h3>',
    )
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-2">$1</h1>')
    // Bold & italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-zinc-800">$1</code>',
    )
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Horizontal rules
    .replace(
      /^---$/gm,
      '<hr class="my-4 border-gray-200 dark:border-zinc-700" />',
    )
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p class="mb-2">')
    // Single newlines within paragraphs
    .replace(/\n/g, "<br />");

  return `<p class="mb-2">${html}</p>`;
}

type ViewMode = "preview" | "raw";

export type DocumentViewerModalProps = {
  document: DocumentWithCreator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const DocumentViewerModal = ({
  document,
  open,
  onOpenChange,
}: DocumentViewerModalProps) => {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");

  useEffect(() => {
    const fileUrl = document?.fileUrl;
    if (!fileUrl || !open) {
      setFileContent(null);
      setViewMode("preview");
      return;
    }

    const controller = new AbortController();

    const fetchContent = async () => {
      setIsLoading(true);
      try {
        const response = await axios.get<string>(fileUrl, {
          responseType: "text",
          signal: controller.signal,
        });
        setFileContent(response.data);
      } catch (error) {
        if (!axios.isCancel(error)) {
          setFileContent(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void fetchContent();

    return () => {
      controller.abort();
    };
  }, [document?.fileUrl, open]);

  const content = fileContent ?? document?.content;

  const previewHtml = useMemo(() => {
    if (!content) return "";
    return renderMarkdown(content);
  }, [content]);

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-full flex-col overflow-hidden sm:w-[95vw] sm:max-w-6xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center justify-between gap-4 pr-8">
            <span className="truncate">{document.title}</span>
            <div className="flex shrink-0 items-center gap-2">
              <div className="inline-flex items-center rounded-md border border-gray-200 dark:border-zinc-700">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 rounded-r-none border-r border-gray-200 px-3 text-xs dark:border-zinc-700",
                    viewMode === "preview" && "bg-gray-100 dark:bg-zinc-800",
                  )}
                  onClick={() => setViewMode("preview")}
                >
                  Preview
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 rounded-l-none px-3 text-xs",
                    viewMode === "raw" && "bg-gray-100 dark:bg-zinc-800",
                  )}
                  onClick={() => setViewMode("raw")}
                >
                  Raw
                </Button>
              </div>
              {document.fileUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={document.fileUrl} download={document.title}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div
            className={cn(
              "flex items-center justify-center rounded border",
              VIEWER_HEIGHT,
            )}
          >
            <Spinner className="h-6 w-6" />
          </div>
        ) : content ? (
          <div className={cn("overflow-auto rounded border", VIEWER_HEIGHT)}>
            {viewMode === "raw" ? (
              <pre className="p-4 text-sm whitespace-pre-wrap">{content}</pre>
            ) : (
              <div
                className="prose prose-sm dark:prose-invert max-w-none p-4"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center justify-center rounded border",
              VIEWER_HEIGHT,
            )}
          >
            <p className="text-muted-foreground text-center">
              No preview available
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
