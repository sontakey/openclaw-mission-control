"use client";

import * as React from "react";
import { cn } from "@clawe/ui/lib/utils";

export const PageHeader = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div className={cn("mb-6 border-b", className)} {...props}>
      {children}
    </div>
  );
};
