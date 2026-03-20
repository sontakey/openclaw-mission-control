import React from "react";

function createPrimitive(tagName) {
  return React.forwardRef(function Primitive({ children, ...props }, ref) {
    return React.createElement(tagName, { ...props, ref }, children);
  });
}

export const AnimatePresence = ({ children }) => React.createElement(React.Fragment, null, children);

export const motion = new Proxy(
  {},
  {
    get: (_target, property) => createPrimitive(String(property)),
  },
);
