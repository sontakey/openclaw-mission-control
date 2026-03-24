import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../src/components/ui/tabs.tsx";

const originalProperties = new Map<string, PropertyDescriptor | undefined>();
const domPropertyNames = [
  "document",
  "window",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "SVGElement",
  "DocumentFragment",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
];

for (const propertyName of domPropertyNames) {
  originalProperties.set(
    propertyName,
    Object.getOwnPropertyDescriptor(globalThis, propertyName),
  );
}

function restoreGlobals() {
  for (const [propertyName, descriptor] of originalProperties) {
    if (!descriptor) {
      Reflect.deleteProperty(globalThis, propertyName);
      continue;
    }

    Object.defineProperty(globalThis, propertyName, descriptor);
  }
}

function installDom(url: string) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url,
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: dom.window.HTMLElement,
  });
  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: dom.window.Element,
  });
  Object.defineProperty(globalThis, "Node", {
    configurable: true,
    value: dom.window.Node,
  });
  Object.defineProperty(globalThis, "SVGElement", {
    configurable: true,
    value: dom.window.SVGElement,
  });
  Object.defineProperty(globalThis, "DocumentFragment", {
    configurable: true,
    value: dom.window.DocumentFragment,
  });
  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    value: dom.window.MutationObserver,
  });
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: dom.window.getComputedStyle.bind(dom.window),
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 0),
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (frameId: number) => clearTimeout(frameId),
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  });

  return dom;
}

function MountTracker({
  label,
  onMount,
}: {
  label: string;
  onMount: () => void;
}) {
  React.useEffect(() => {
    onMount();
  }, []);

  return <div>{label}</div>;
}

test.afterEach(() => {
  cleanup();
  restoreGlobals();
});

test("tabs can keep content mounted across switches when forceMount is enabled", () => {
  const dom = installDom("http://localhost:4173");
  const mountCounts = {
    overview: 0,
    prd: 0,
  };

  try {
    const view = render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="prd">PRD</TabsTrigger>
        </TabsList>
        <TabsContent forceMount value="overview">
          <MountTracker
            label="Overview content"
            onMount={() => {
              mountCounts.overview += 1;
            }}
          />
        </TabsContent>
        <TabsContent forceMount value="prd">
          <MountTracker
            label="PRD content"
            onMount={() => {
              mountCounts.prd += 1;
            }}
          />
        </TabsContent>
      </Tabs>,
    );

    assert.deepEqual(mountCounts, {
      overview: 1,
      prd: 1,
    });

    fireEvent.click(view.getByRole("tab", { name: "PRD" }));
    fireEvent.click(view.getByRole("tab", { name: "Overview" }));
    fireEvent.click(view.getByRole("tab", { name: "PRD" }));

    assert.deepEqual(mountCounts, {
      overview: 1,
      prd: 1,
    });
    assert.equal(view.getAllByRole("tabpanel", { hidden: true }).length, 2);
  } finally {
    dom.window.close();
  }
});
