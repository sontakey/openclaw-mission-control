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

export const AlignLeft = createIcon("AlignLeft");
export const AlertTriangle = createIcon("AlertTriangle");
export const Bell = createIcon("Bell");
export const BellOff = createIcon("BellOff");
export const Check = createIcon("Check");
export const CheckCircle2 = createIcon("CheckCircle2");
export const CheckIcon = createIcon("CheckIcon");
export const ChevronDown = createIcon("ChevronDown");
export const ChevronDownIcon = createIcon("ChevronDownIcon");
export const ChevronRight = createIcon("ChevronRight");
export const ChevronRightIcon = createIcon("ChevronRightIcon");
export const ChevronUp = createIcon("ChevronUp");
export const Circle = createIcon("Circle");
export const CircleCheck = createIcon("CircleCheck");
export const CircleCheckIcon = createIcon("CircleCheckIcon");
export const CircleDot = createIcon("CircleDot");
export const CircleIcon = createIcon("CircleIcon");
export const Eye = createIcon("Eye");
export const FileText = createIcon("FileText");
export const GripVerticalIcon = createIcon("GripVerticalIcon");
export const Heart = createIcon("Heart");
export const Inbox = createIcon("Inbox");
export const InfoIcon = createIcon("InfoIcon");
export const Loader2 = createIcon("Loader2");
export const Loader2Icon = createIcon("Loader2Icon");
export const Mail = createIcon("Mail");
export const MessageSquare = createIcon("MessageSquare");
export const Moon = createIcon("Moon");
export const MoreHorizontal = createIcon("MoreHorizontal");
export const OctagonXIcon = createIcon("OctagonXIcon");
export const Pencil = createIcon("Pencil");
export const Play = createIcon("Play");
export const Plus = createIcon("Plus");
export const Target = createIcon("Target");
export const ThumbsUp = createIcon("ThumbsUp");
export const TriangleAlertIcon = createIcon("TriangleAlertIcon");
export const User = createIcon("User");
export const Users = createIcon("Users");
export const XIcon = createIcon("XIcon");
export const Zap = createIcon("Zap");

export default icons;
