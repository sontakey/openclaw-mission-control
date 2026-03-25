import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { MemoryRouter } from "react-router-dom";

import { AppShell } from "../src/App.tsx";
import type { Agent } from "../src/lib/types.ts";

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

  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({
      addEventListener() {},
      dispatchEvent() {
        return true;
      },
      matches: false,
      media: "",
      onchange: null,
      removeEventListener() {},
      removeListener() {},
      addListener() {},
    }),
  });

  return dom;
}

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    children: [],
    currentActivity: "Reviewing priorities",
    currentTask: null,
    delegatesTo: [],
    emoji: "🤖",
    id: "agent-1",
    lastHeartbeat: 1_710_000_000_000,
    model: null,
    name: "Alpha",
    parentId: null,
    role: "Operator",
    sessionKey: "agent:alpha:main",
    status: "online",
    ...overrides,
  };
}

test.afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  globalThis.fetch = originalFetch;
  restoreGlobals();
});

test("agents route shares one agents fetch between the sidebar roster and agents page", async () => {
  const dom = installDom("http://localhost:4173");
  const calls: string[] = [];
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
      return new Response(JSON.stringify([createAgent()]), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    view = render(
      <MemoryRouter initialEntries={["/agents"]}>
        <AppShell />
      </MemoryRouter>,
    );

    await waitFor(() => {
      assert.equal(
        calls.filter((url) => url === "http://localhost:4173/api/agents").length,
        1,
      );
      assert.equal(
        calls.filter((url) => url === "http://localhost:4173/api/gateway/health").length,
        1,
      );
      assert.ok(view.getAllByText("Alpha").length >= 2);
      assert.ok(view.getByText("Gateway"));
      assert.ok(view.getByLabelText("Agent roster"));
      assert.ok(view.getByText("Your AI agents and their current status."));
    });
  } finally {
    view?.unmount();
    dom.window.close();
  }
});

test("clicking a sidebar agent opens the agent detail drawer", async () => {
  const dom = installDom("http://localhost:4173");
  const calls: string[] = [];
  let view: ReturnType<typeof render> | null = null;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);

    if (url === "http://localhost:4173/api/agents") {
      return new Response(JSON.stringify([createAgent()]), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url === "http://localhost:4173/api/agents/agent-1/detail") {
      return new Response(
        JSON.stringify({
          activities: [],
          sessions: [
            {
              agentId: "agent-1",
              currentActivity: "Main loop",
              lastHeartbeat: 1_710_000_000_000,
              sessionKey: "agent:alpha:main",
            },
          ],
          tasks: [],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

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

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    view = render(
      <MemoryRouter initialEntries={["/agents"]}>
        <AppShell />
      </MemoryRouter>,
    );

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: "Open agent details for Alpha" }));
      assert.ok(view.getByText("Gateway"));
    });

    fireEvent.click(view.getByRole("button", { name: "Open agent details for Alpha" }));

    await waitFor(() => {
      assert.ok(view.getByRole("dialog", { name: "Alpha details" }));
      assert.ok(view.getByText("agent:alpha:main"));
      assert.ok(calls.includes("http://localhost:4173/api/agents/agent-1/detail"));
    });
  } finally {
    view?.unmount();
    dom.window.close();
  }
});

test("clicking a sidebar agent opens the agent detail drawer from the shared shell", async () => {
  const dom = installDom("http://localhost:4173/settings");
  const calls: string[] = [];
  let view: ReturnType<typeof render> | null = null;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);

    if (url === "http://localhost:4173/api/agents") {
      return new Response(JSON.stringify([createAgent()]), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url === "http://localhost:4173/api/agents/agent-1/detail") {
      return new Response(
        JSON.stringify({
          activities: [],
          sessions: [
            {
              agentId: "agent-1",
              currentActivity: "Main loop",
              lastHeartbeat: 1_710_000_000_000,
              sessionKey: "agent:alpha:main",
            },
          ],
          tasks: [],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

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

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    view = render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AppShell />
      </MemoryRouter>,
    );

    await waitFor(() => {
      assert.ok(view.getByText("Gateway connection"));
      assert.ok(view.getByRole("button", { name: "Open agent details for Alpha" }));
    });

    fireEvent.click(view.getByRole("button", { name: "Open agent details for Alpha" }));

    await waitFor(() => {
      assert.ok(view.getByRole("dialog", { name: "Alpha details" }));
      assert.ok(view.getByText("agent:alpha:main"));
      assert.ok(calls.includes("http://localhost:4173/api/agents/agent-1/detail"));
    });
  } finally {
    view?.unmount();
    dom.window.close();
  }
});
