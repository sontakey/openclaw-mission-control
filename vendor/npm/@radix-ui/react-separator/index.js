import React from "react";

export const Root = React.forwardRef(function Separator(props, ref) {
  return React.createElement("div", { ...props, ref });
});
