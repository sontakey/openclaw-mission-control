import React from "react";

export const Slot = React.forwardRef(function Slot({ children, ...props }, ref) {
  if (React.isValidElement(children)) {
    return React.cloneElement(children, { ...props, ref });
  }

  return React.createElement(React.Fragment, null, children);
});
