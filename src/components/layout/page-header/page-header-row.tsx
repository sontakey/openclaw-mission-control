"use client";

import * as React from "react";
import { cn } from "@clawe/ui/lib/utils";

export const PageHeaderRow = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div
      className={cn("flex items-center justify-between gap-4 pb-4", className)}
      {...props}
    >
      {children}
    </div>
  );
};
