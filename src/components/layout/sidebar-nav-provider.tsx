"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { usePathname } from "next/navigation";

type SidebarView = "main" | "settings";

type SidebarNavContextValue = {
  view: SidebarView;
  setView: (view: SidebarView) => void;
  goToSettings: () => void;
  goToMain: () => void;
};

const SidebarNavContext = createContext<SidebarNavContextValue | null>(null);

const getViewFromPathname = (pathname: string): SidebarView => {
  return pathname.startsWith("/settings") ? "settings" : "main";
};

export const useSidebarNav = () => {
  const context = useContext(SidebarNavContext);
  if (!context) {
    throw new Error("useSidebarNav must be used within SidebarNavProvider");
  }
  return context;
};

export const SidebarNavProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const [view, setView] = useState<SidebarView>(() =>
    getViewFromPathname(pathname),
  );

  // Sync view with pathname changes (browser back/forward, direct navigation)
  useEffect(() => {
    setView(getViewFromPathname(pathname));
  }, [pathname]);

  const goToSettings = useCallback(() => setView("settings"), []);
  const goToMain = useCallback(() => setView("main"), []);

  return (
    <SidebarNavContext.Provider
      value={{ view, setView, goToSettings, goToMain }}
    >
      {children}
    </SidebarNavContext.Provider>
  );
};
