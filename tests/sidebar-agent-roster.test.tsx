import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import {
  DashboardSidebarContent,
} from "../src/components/layout/dashboard-sidebar.tsx";
import { SidebarProvider } from "../src/components/ui/sidebar.tsx";
import type { Agent } from "../src/lib/types.ts";

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

test("dashboard sidebar renders the agent roster below nav items", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <SidebarProvider defaultOpen>
        <DashboardSidebarContent
          agents={[
            createAgent(),
            createAgent({
              emoji: "🛠️",
              id: "agent-2",
              name: "Bravo",
              sessionKey: "agent:bravo:main",
              status: "offline",
            }),
          ]}
          onAgentSelect={() => undefined}
          selectedAgentId="agent-2"
        />
      </SidebarProvider>
    </MemoryRouter>,
  );
  assert.match(html, />Settings</);
  assert.match(html, /Agent roster/);
  assert.match(html, /🤖/);
  assert.match(html, /Alpha/);
  assert.match(html, /aria-label="Alpha is online"/);
  assert.match(html, /aria-label="Open agent details for Alpha"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /bg-green-500/);
  assert.match(html, /🛠️/);
  assert.match(html, /Bravo/);
  assert.match(html, /aria-label="Bravo is offline"/);
  assert.match(html, /aria-label="Open agent details for Bravo"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /bg-red-500/);
  assert.match(html, />Settings<[\s\S]*Agent roster/);
});

test("collapsed dashboard sidebar keeps agent emoji visible with an overlaid status dot", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <SidebarProvider open={false}>
        <DashboardSidebarContent
          agents={[
            createAgent(),
            createAgent({
              emoji: "🛠️",
              id: "agent-2",
              name: "Bravo",
              sessionKey: "agent:bravo:main",
              status: "offline",
            }),
          ]}
          onAgentSelect={() => undefined}
          selectedAgentId="agent-1"
        />
      </SidebarProvider>
    </MemoryRouter>,
  );

  assert.match(html, /data-collapsible="icon"/);
  assert.match(html, /aria-label="Agent roster"/);
  assert.match(html, /🤖/);
  assert.match(html, /🛠️/);
  assert.match(
    html,
    /group-data-\[collapsible=icon\]:absolute group-data-\[collapsible=icon\]:right-1 group-data-\[collapsible=icon\]:bottom-1/,
  );
  assert.match(
    html,
    /group-data-\[collapsible=icon\]:ring-2 group-data-\[collapsible=icon\]:ring-sidebar/,
  );
  assert.match(
    html,
    /group-data-\[collapsible=icon\]:mx-auto group-data-\[collapsible=icon\]:size-9 group-data-\[collapsible=icon\]:justify-center group-data-\[collapsible=icon\]:px-0/,
  );
});
