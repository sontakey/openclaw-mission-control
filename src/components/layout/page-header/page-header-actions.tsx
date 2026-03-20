import * as React from "react";
import { cn } from "@/lib/utils";

export const PageHeaderActions = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      {children}
    </div>
  );
};
