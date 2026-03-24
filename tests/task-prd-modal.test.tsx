import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";

import { TaskDetailModalBody } from "../src/components/kanban/task-detail-modal.tsx";
import type { KanbanTask } from "../src/components/kanban/types.ts";

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

  return dom;
}

function createTask(overrides: Partial<KanbanTask> = {}): KanbanTask {
  return {
    id: "task-1",
    priority: "medium",
    status: "in_progress",
    subtasks: [],
    title: "Ship PRD viewer",
    ...overrides,
  };
}

test.afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  restoreGlobals();
});

test("task detail modal opens URL artifacts in a new browser tab", () => {
  const dom = installDom("http://localhost:4173");

  try {
    const view = render(
      <TaskDetailModalBody
        open
        onOpenChange={() => {}}
        task={createTask({
          artifacts: [
            {
              label: "Deploy URL",
              type: "url",
              value: "https://deploy.example.com/release",
            },
          ],
        })}
      />,
    );

    const link = view.getByRole("link", { name: /Deploy URL/i });

    assert.equal(
      link.getAttribute("href"),
      "https://deploy.example.com/release",
    );
    assert.equal(link.getAttribute("target"), "_blank");
    assert.equal(link.getAttribute("rel"), "noreferrer noopener");
  } finally {
    dom.window.close();
  }
});

test("task detail modal renders PRD markdown and does not refetch when switching back to the PRD tab", async () => {
  const dom = installDom("http://localhost:4173");
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input, init) => {
    calls.push({ init, input });

    return new Response(
      JSON.stringify({
        content: [
          "# Mission",
          "",
          "Ship the PRD viewer.",
          "",
          "- Render markdown",
          "- Keep tab fetches cached",
          "",
          "```ts",
          "const ready = true;",
          "```",
        ].join("\n"),
        exists: true,
        path: "/home/ubuntu/Projects/mission-control/PRD.md",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  }) as typeof fetch;

  try {
    const view = render(
      <TaskDetailModalBody
        open
        onOpenChange={() => {}}
        task={createTask({
          artifacts: [
            {
              label: "PRD",
              type: "file",
              value: "/home/ubuntu/Projects/mission-control/PRD.md",
            },
          ],
          description: "Show the PRD inline in the task modal.",
        })}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: /PRD/i }));

    await waitFor(() => {
      assert.ok(view.getByRole("heading", { name: "Mission" }));
    });

    assert.ok(view.getByText("Ship the PRD viewer."));
    assert.ok(view.getByText("Render markdown"));
    assert.ok(view.getByText("Keep tab fetches cached"));
    assert.ok(view.getByText("const ready = true;"));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      init: {
        headers: new Headers({
          Accept: "application/json",
        }),
        method: "GET",
      },
      input: "http://localhost:4173/api/tasks/task-1/prd",
    });

    fireEvent.click(view.getByRole("tab", { name: "Overview" }));

    assert.ok(view.getByText("Render markdown"));
    assert.equal(calls.length, 1);

    fireEvent.click(view.getByRole("tab", { name: "PRD" }));

    await waitFor(() => {
      assert.ok(view.getByText("Render markdown"));
    });

    assert.equal(calls.length, 1);
  } finally {
    dom.window.close();
  }
});

type FetchCall = {
  init: Parameters<typeof fetch>[1];
  input: Parameters<typeof fetch>[0];
};
