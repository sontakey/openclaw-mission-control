import * as React from "react";

const SCROLL_THRESHOLD_PX = 80;

export function useAutoScroll() {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      setShowScrollButton(false);
      return;
    }

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    setShowScrollButton(distanceFromBottom > SCROLL_THRESHOLD_PX);
  }, []);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    element.scrollTo({
      behavior,
      top: element.scrollHeight,
    });
  }, []);

  React.useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    updateScrollState();
    element.addEventListener("scroll", updateScrollState);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
    };
  }, [updateScrollState]);

  return {
    scrollRef,
    scrollToBottom,
    showScrollButton,
  };
}
