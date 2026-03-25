import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";

import { GatewayHealthChip } from "../src/components/layout/gateway-health-chip.tsx";

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

  return dom;
}

test.afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  restoreGlobals();
});

test("gateway health chip reports a healthy connection after loading", async () => {
  const dom = installDom("http://localhost:4173");
  let view: ReturnType<typeof render> | null = null;

  globalThis.fetch = (async (input) => {
    assert.equal(String(input), "http://localhost:4173/api/gateway/health");

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
  }) as typeof fetch;

  try {
    view = render(<GatewayHealthChip />);

    assert.ok(view.getByText("Gateway checking"));

    await waitFor(() => {
      const status = view.getByRole("status");

      assert.ok(view.getByText("Gateway"));
      assert.equal(status.getAttribute("data-state"), "healthy");
      assert.match(status.innerHTML, /bg-emerald-500/);
    });
  } finally {
    view?.unmount();
    dom.window.close();
  }
});

test("gateway health chip reports a disconnected gateway when the gateway status is disconnected", async () => {
  const dom = installDom("http://localhost:4173");
  let view: ReturnType<typeof render> | null = null;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        hasToken: true,
        latencyMs: 42,
        status: "disconnected",
        url: "http://localhost:4000",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  }) as typeof fetch;

  try {
    view = render(<GatewayHealthChip />);

    await waitFor(() => {
      const status = view.getByRole("status");

      assert.ok(view.getByText("Disconnected"));
      assert.equal(status.getAttribute("data-state"), "unhealthy");
      assert.match(status.innerHTML, /bg-red-500/);
    });
  } finally {
    view?.unmount();
    dom.window.close();
  }
});

test("gateway health chip reports a disconnected gateway when the request fails", async () => {
  const dom = installDom("http://localhost:4173");
  let view: ReturnType<typeof render> | null = null;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        error: "Failed to load gateway config.",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 502,
      },
    );
  }) as typeof fetch;

  try {
    view = render(<GatewayHealthChip />);

    await waitFor(() => {
      const status = view.getByRole("status");

      assert.ok(view.getByText("Disconnected"));
      assert.equal(status.getAttribute("data-state"), "unhealthy");
      assert.match(status.innerHTML, /bg-red-500/);
    });
  } finally {
    view?.unmount();
    dom.window.close();
  }
});
