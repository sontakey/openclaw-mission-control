"use client";

import * as React from "react";
import { cn } from "@clawe/ui/lib/utils";

export const PageHeaderTitle = ({
  className,
  children,
  ...props
}: React.ComponentProps<"h1">) => {
  return (
    <h1
      className={cn("text-xl font-medium tracking-tight", className)}
      {...props}
    >
      {children}
    </h1>
  );
};
