"use client";

import * as React from "react";
import { cn } from "@clawe/ui/lib/utils";

export const PageHeaderTabs = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div
      className={cn(
        "relative flex items-center gap-1 border-b pb-1.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
