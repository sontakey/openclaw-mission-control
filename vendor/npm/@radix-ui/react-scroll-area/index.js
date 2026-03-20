import React from "react";

function createPrimitive(tagName = "div") {
  return React.forwardRef(function Primitive({ children, ...props }, ref) {
    return React.createElement(tagName, { ...props, ref }, children);
  });
}

export const Root = createPrimitive();
export const Viewport = createPrimitive();
export const Scrollbar = createPrimitive();
export const Thumb = createPrimitive();
export const Corner = createPrimitive();
