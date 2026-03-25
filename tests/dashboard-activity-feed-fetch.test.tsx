import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { MemoryRouter } from "react-router-dom";

import { AppShell } from "../src/App.tsx";

const originalFetch = globalThis.fetch;
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
  "EventSource",
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
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url });

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
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value: class EventSource {
      constructor(_url: string) {}

      addEventListener() {}
      close() {}
      removeEventListener() {}
    },
  });

  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({
      addEventListener() {},
      addListener() {},
      dispatchEvent() {
        return true;
      },
      matches: false,
      media: "",
      onchange: null,
      removeEventListener() {},
      removeListener() {},
    }),
  });

  return dom;
}

function createActivity(index: number) {
  return {
    agent_id: `agent-${index}`,
    created_at: 1_710_000_000 + index,
    id: `activity-${index}`,
    message: `Created task "Task ${String(index).padStart(2, "0")}".`,
    metadata: null,
    task_id: `task-${index}`,
    type: "task_created",
  };
}

test.afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  globalThis.fetch = originalFetch;
  restoreGlobals();
});

test("dashboard fetches the recent activity feed with a 10 item limit", async () => {
  const dom = installDom("http://localhost:4173");
  const calls: string[] = [];
  const activities = Array.from({ length: 12 }, (_, index) =>
    createActivity(12 - index),
  );
  let view: ReturnType<typeof render> | null = null;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);

    if (url === "http://localhost:4173/api/gateway/health") {
      return new Response(
        JSON.stringify({
          hasToken: true,
          latencyMs: 42,
          status: "connected",
          url: "http://localhost:4000",
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (url === "http://localhost:4173/api/agents") {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url === "http://localhost:4173/api/tasks") {
      return new Response(JSON.stringify({ tasks: [] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url === "http://localhost:4173/api/activities?limit=10") {
      return new Response(JSON.stringify({ activities }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    view = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>,
    );

    await waitFor(() => {
      assert.ok(view?.getByText("Recent Activity"));
      assert.ok(view?.getByText("Latest 10 updates from the mission feed."));
      assert.equal(view?.getAllByText(/^Task \d{2}$/).length, 10);
      assert.ok(view?.getByText("Task 12"));
      assert.ok(view?.getByText("Task 03"));
      assert.equal(view?.queryByText("Task 02"), null);
      assert.equal(view?.queryByText("Task 01"), null);
      assert.equal(
        calls.filter((url) => url === "http://localhost:4173/api/activities?limit=10").length,
        1,
      );
    });
  } finally {
    view?.unmount();
    dom.window.close();
  }
});
