import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type ChatPanelContextValue = {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
};

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export const useChatPanel = () => {
  const context = useContext(ChatPanelContext);
  if (!context) {
    throw new Error("useChatPanel must be used within ChatPanelProvider");
  }
  return context;
};

export const ChatPanelProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <ChatPanelContext.Provider value={{ isOpen, toggle, open, close }}>
      {children}
    </ChatPanelContext.Provider>
  );
};
