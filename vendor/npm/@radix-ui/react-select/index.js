import React from "react";

function createPrimitive(tagName = "div") {
  return React.forwardRef(function Primitive({ children, ...props }, ref) {
    return React.createElement(tagName, { ...props, ref }, children);
  });
}

export const Root = createPrimitive();
export const Trigger = createPrimitive("button");
export const Value = createPrimitive("span");
export const Icon = createPrimitive("span");
export const Portal = ({ children }) => React.createElement(React.Fragment, null, children);
export const Content = createPrimitive();
export const Viewport = createPrimitive();
export const Group = createPrimitive();
export const Label = createPrimitive("label");
export const Item = createPrimitive();
export const ItemText = createPrimitive("span");
export const ItemIndicator = createPrimitive("span");
export const ScrollUpButton = createPrimitive("button");
export const ScrollDownButton = createPrimitive("button");
export const Separator = createPrimitive();
