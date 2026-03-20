import * as React from "react";

type Entry = string | { pathname: string };

export interface BrowserRouterProps {
  children?: React.ReactNode;
}

export interface MemoryRouterProps {
  children?: React.ReactNode;
  initialEntries?: Entry[];
}

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export interface RouteProps {
  element: React.ReactNode;
  path: string;
}

export interface RoutesProps {
  children?: React.ReactNode;
}

export declare function BrowserRouter(props: BrowserRouterProps): React.JSX.Element;
export declare function Link(props: LinkProps): React.JSX.Element;
export declare function MemoryRouter(props: MemoryRouterProps): React.JSX.Element;
export declare function Route(props: RouteProps): null;
export declare function Routes(props: RoutesProps): React.ReactNode;
export declare function useLocation(): { pathname: string };
export declare function useNavigate(): (to: string) => void;
