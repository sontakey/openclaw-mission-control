import React from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatPanel } from "@/providers/chat-panel-provider";


export const ChatPanelToggle = () => {
  const { isOpen, toggle } = useChatPanel();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(isOpen && "bg-accent")}
          onClick={toggle}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isOpen ? "Close chat" : "Open chat"}
      </TooltipContent>
    </Tooltip>
  );
};
