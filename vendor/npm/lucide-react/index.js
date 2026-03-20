import React from "react";

function createIcon(displayName) {
  return React.forwardRef(function Icon(props, ref) {
    return React.createElement("svg", { ...props, "data-icon": displayName, ref });
  });
}

export const icons = new Proxy(
  {},
  {
    get: (_target, property) => createIcon(String(property)),
  },
);

export default icons;
