declare module "lucide-react" {
  import type { ComponentType, SVGProps } from "react";

  const icons: Record<string, ComponentType<SVGProps<SVGSVGElement>>>;
  export const AlignLeft: ComponentType<SVGProps<SVGSVGElement>>;
  export const AlertTriangle: ComponentType<SVGProps<SVGSVGElement>>;
  export const Bell: ComponentType<SVGProps<SVGSVGElement>>;
  export const BellOff: ComponentType<SVGProps<SVGSVGElement>>;
  export const Check: ComponentType<SVGProps<SVGSVGElement>>;
  export const CheckCircle2: ComponentType<SVGProps<SVGSVGElement>>;
  export const CheckIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const ChevronDown: ComponentType<SVGProps<SVGSVGElement>>;
  export const ChevronDownIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const ChevronRight: ComponentType<SVGProps<SVGSVGElement>>;
  export const ChevronRightIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const ChevronUp: ComponentType<SVGProps<SVGSVGElement>>;
  export const Circle: ComponentType<SVGProps<SVGSVGElement>>;
  export const CircleCheck: ComponentType<SVGProps<SVGSVGElement>>;
  export const CircleCheckIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const CircleDot: ComponentType<SVGProps<SVGSVGElement>>;
  export const CircleIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const Eye: ComponentType<SVGProps<SVGSVGElement>>;
  export const ExternalLink: ComponentType<SVGProps<SVGSVGElement>>;
  export const FileText: ComponentType<SVGProps<SVGSVGElement>>;
  export const Folder: ComponentType<SVGProps<SVGSVGElement>>;
  export const GripVerticalIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const Heart: ComponentType<SVGProps<SVGSVGElement>>;
  export const Inbox: ComponentType<SVGProps<SVGSVGElement>>;
  export const InfoIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const Loader2: ComponentType<SVGProps<SVGSVGElement>>;
  export const Loader2Icon: ComponentType<SVGProps<SVGSVGElement>>;
  export const Mail: ComponentType<SVGProps<SVGSVGElement>>;
  export const MessageSquare: ComponentType<SVGProps<SVGSVGElement>>;
  export const Moon: ComponentType<SVGProps<SVGSVGElement>>;
  export const MoreHorizontal: ComponentType<SVGProps<SVGSVGElement>>;
  export const OctagonXIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const Pencil: ComponentType<SVGProps<SVGSVGElement>>;
  export const Play: ComponentType<SVGProps<SVGSVGElement>>;
  export const Plus: ComponentType<SVGProps<SVGSVGElement>>;
  export const Target: ComponentType<SVGProps<SVGSVGElement>>;
  export const ThumbsUp: ComponentType<SVGProps<SVGSVGElement>>;
  export const TriangleAlertIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const User: ComponentType<SVGProps<SVGSVGElement>>;
  export const Users: ComponentType<SVGProps<SVGSVGElement>>;
  export const XIcon: ComponentType<SVGProps<SVGSVGElement>>;
  export const Zap: ComponentType<SVGProps<SVGSVGElement>>;

  export default icons;
}

declare module "framer-motion" {
  export const motion: Record<string, any>;
}

declare module "@radix-ui/react-slot" {
  import type { ComponentType } from "react";

  export const Slot: ComponentType<any>;
}

declare module "@radix-ui/react-dialog" {
  import type { ComponentType } from "react";

  export const Root: ComponentType<any>;
  export const Trigger: ComponentType<any>;
  export const Close: ComponentType<any>;
  export const Portal: ComponentType<any>;
  export const Overlay: ComponentType<any>;
  export const Content: ComponentType<any>;
  export const Title: ComponentType<any>;
  export const Description: ComponentType<any>;
}

declare module "@radix-ui/react-popover" {
  import type { ComponentType } from "react";

  export const Root: ComponentType<any>;
  export const Trigger: ComponentType<any>;
  export const Portal: ComponentType<any>;
  export const Content: ComponentType<any>;
  export const Anchor: ComponentType<any>;
}

declare module "@radix-ui/react-scroll-area" {
  import type { ComponentType } from "react";

  export const Root: ComponentType<any>;
  export const Viewport: ComponentType<any>;
  export const Scrollbar: ComponentType<any>;
  export const Thumb: ComponentType<any>;
  export const Corner: ComponentType<any>;
}

declare module "@radix-ui/react-select" {
  import type { ComponentType } from "react";

  export const Root: ComponentType<any>;
  export const Group: ComponentType<any>;
  export const Value: ComponentType<any>;
  export const Trigger: ComponentType<any>;
  export const Icon: ComponentType<any>;
  export const Portal: ComponentType<any>;
  export const Content: ComponentType<any>;
  export const Viewport: ComponentType<any>;
  export const Label: ComponentType<any>;
  export const Item: ComponentType<any>;
  export const ItemText: ComponentType<any>;
  export const ItemIndicator: ComponentType<any>;
  export const ScrollUpButton: ComponentType<any>;
  export const ScrollDownButton: ComponentType<any>;
  export const Separator: ComponentType<any>;
}

declare module "@radix-ui/react-separator" {
  import type { ComponentType } from "react";

  export const Root: ComponentType<any>;
}

declare module "@radix-ui/react-tooltip" {
  import type { ComponentType } from "react";

  export const Provider: ComponentType<any>;
  export const Root: ComponentType<any>;
  export const Trigger: ComponentType<any>;
  export const Portal: ComponentType<any>;
  export const Content: ComponentType<any>;
  export const Arrow: ComponentType<any>;
}

declare module "class-variance-authority" {
  export type VariantProps<T> = Record<string, unknown>;

  export function cva(...args: any[]): any;
}

declare module "tailwind-merge" {
  export function twMerge(...classLists: string[]): string;
}
