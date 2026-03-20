import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { XIcon } from "./icons";

type AgentOption = {
  label: string;
  sessionKey: string;
};

export type ChatHeaderProps = {
  agentOptions?: AgentOption[];
  disabled?: boolean;
  mode?: "panel" | "full";
  onClose?: () => void;
  onSessionKeyChange?: (sessionKey: string) => void;
  isStreaming?: boolean;
  className?: string;
  selectedSessionKey?: string;
};

export const ChatHeader = ({
  agentOptions = [],
  disabled,
  mode = "full",
  onClose,
  onSessionKeyChange,
  isStreaming,
  className,
  selectedSessionKey,
}: ChatHeaderProps) => {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b px-4 py-3",
        mode === "panel" && "px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2
            className={cn(
              "text-foreground font-semibold",
              mode === "panel" ? "text-sm" : "text-lg",
            )}
          >
            Chat
          </h2>
          {isStreaming && (
            <span className="text-muted-foreground text-xs">Generating...</span>
          )}
        </div>

        {agentOptions.length > 0 && (
          <label className="text-muted-foreground flex max-w-sm items-center gap-2 text-xs">
            <span className="shrink-0 font-medium uppercase tracking-wide">
              Agent
            </span>
            <select
              value={selectedSessionKey}
              onChange={(event) => onSessionKeyChange?.(event.target.value)}
              disabled={disabled}
              className="border-input bg-background text-foreground min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
            >
              {agentOptions.map((option) => (
                <option key={option.sessionKey} value={option.sessionKey}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {mode === "panel" && onClose && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};
