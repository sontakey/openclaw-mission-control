import React, { Children, createContext, useContext, useEffect, useMemo, useState } from "react";

const RouterContext = createContext({
  navigate: () => {},
  pathname: "/",
});

function getPathname(entry) {
  if (typeof entry === "string") {
    return entry;
  }

  if (entry && typeof entry === "object" && "pathname" in entry && typeof entry.pathname === "string") {
    return entry.pathname;
  }

  return "/";
}

function useRouter() {
  return useContext(RouterContext);
}

export function useLocation() {
  const { pathname } = useRouter();
  return { pathname };
}

export function useNavigate() {
  const { navigate } = useRouter();
  return navigate;
}

function createProvider(children, pathname, navigate) {
  return React.createElement(
    RouterContext.Provider,
    { value: { navigate, pathname } },
    children,
  );
}

export function BrowserRouter({ children }) {
  const [pathname, setPathname] = useState(() => globalThis.location?.pathname ?? "/");

  useEffect(() => {
    const handlePopState = () => {
      setPathname(globalThis.location?.pathname ?? "/");
    };

    globalThis.addEventListener?.("popstate", handlePopState);

    return () => {
      globalThis.removeEventListener?.("popstate", handlePopState);
    };
  }, []);

  const navigate = useMemo(
    () => (to) => {
      if (globalThis.history?.pushState) {
        globalThis.history.pushState({}, "", to);
        setPathname(globalThis.location?.pathname ?? to);
        return;
      }

      setPathname(to);
    },
    [],
  );

  return createProvider(children, pathname, navigate);
}

export function MemoryRouter({ children, initialEntries = ["/"] }) {
  const [pathname, setPathname] = useState(() => getPathname(initialEntries[0]));
  const navigate = useMemo(() => (to) => setPathname(to), []);

  return createProvider(children, pathname, navigate);
}

export function Link({ children, onClick, target, to, ...props }) {
  const { navigate } = useRouter();

  return React.createElement(
    "a",
    {
      ...props,
      href: to,
      onClick: (event) => {
        onClick?.(event);

        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          target === "_blank" ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        ) {
          return;
        }

        event.preventDefault();
        navigate(to);
      },
      target,
    },
    children,
  );
}

export function Route() {
  return null;
}

export function Routes({ children }) {
  const { pathname } = useRouter();

  const match = Children.toArray(children).find((child) => {
    if (!React.isValidElement(child)) {
      return false;
    }

    if (child.props.path === "*") {
      return true;
    }

    if (typeof child.props.path === "string" && child.props.path.endsWith("/*")) {
      return pathname.startsWith(child.props.path.slice(0, -2));
    }

    return child.props.path === pathname;
  });

  return React.isValidElement(match) ? match.props.element ?? null : null;
}
