"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@clawe/ui/lib/utils";

export interface PageHeaderTabProps extends React.ComponentProps<"button"> {
  active?: boolean;
}

export const PageHeaderTab = ({
  className,
  active = false,
  children,
  ...props
}: PageHeaderTabProps) => {
  return (
    <button
      className={cn(
        "text-muted-foreground hover:text-foreground hover:bg-muted relative rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
        active && "text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {active && (
        <motion.div
          layoutId="page-header-tab-underline"
          className="bg-brand absolute right-0 -bottom-[8px] left-0 h-0.5"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  );
};
