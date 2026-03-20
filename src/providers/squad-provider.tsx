import React, { createContext, useContext, type ReactNode } from "react";

import { useAgents } from "@/hooks/useAgents";

type SquadContextType = ReturnType<typeof useAgents>;

const SquadContext = createContext<SquadContextType | null>(null);

export const SquadProvider = ({ children }: { children: ReactNode }) => {
  const { agents, error, isLoading, refetch, status } = useAgents();

  return (
    <SquadContext.Provider
      value={{
        agents,
        error,
        isLoading,
        refetch,
        status,
      }}
    >
      {children}
    </SquadContext.Provider>
  );
};

export const useSquad = () => {
  const context = useContext(SquadContext);
  if (!context) {
    throw new Error("useSquad must be used within a SquadProvider");
  }
  return context;
};
