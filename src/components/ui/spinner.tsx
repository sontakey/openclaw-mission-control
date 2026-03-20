import React, { type ComponentProps, type ComponentType } from "react";
import lucideIcons from "lucide-react";

import { cn } from "@/lib/utils";

const Loader2Icon = (
  lucideIcons as Record<string, ComponentType<ComponentProps<"svg">>>
).Loader2;

function Spinner({ className, ...props }: ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
