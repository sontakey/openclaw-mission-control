import type { ComponentType, SVGProps } from "react";
import lucideIcons from "lucide-react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const icons = lucideIcons as Record<string, IconComponent>;

export const ArrowDownIcon = icons.ArrowDown;
export const BotIcon = icons.Bot;
export const InfoIcon = icons.Info;
export const Loader2Icon = icons.Loader2;
export const MessageSquareIcon = icons.MessageSquare;
export const PaperclipIcon = icons.Paperclip;
export const SendIcon = icons.Send;
export const SquareIcon = icons.Square;
export const UserIcon = icons.User;
export const XIcon = icons.X;
