import React from "react";

function createPrimitive(tagName = "div") {
  return React.forwardRef(function Primitive({ children, ...props }, ref) {
    return React.createElement(tagName, { ...props, ref }, children);
  });
}

export const Root = createPrimitive();
export const Trigger = createPrimitive("button");
export const Content = createPrimitive();
