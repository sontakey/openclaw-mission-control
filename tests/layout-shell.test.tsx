import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { AppShell } from "../src/App.tsx";

test("app shell renders Mission Control sidebar navigation on board", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, /Mission Control/);
  assert.match(html, />Board</);
  assert.match(html, />Agents</);
  assert.match(html, />Settings</);
  assert.match(html, /Chat/);
  assert.match(html, /Review incoming work, track delivery, and keep the live activity stream close\./);
  assert.match(html, />Inbox</);
  assert.match(html, />Assigned</);
  assert.match(html, />In Progress</);
  assert.match(html, />Review</);
  assert.match(html, />Done</);
  assert.match(html, /No tasks yet\. Create one to populate the board\./);
});

test("settings route keeps the top-level sidebar navigation", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/settings"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, /Mission Control/);
  assert.match(html, />Board</);
  assert.match(html, />Agents</);
  assert.match(html, />Settings</);
  assert.match(html, /Gateway connection/);
  assert.match(html, /Cron jobs/);
  assert.match(html, /Use light theme/);
  assert.match(
    html,
    /Gateway connection details, scheduled jobs, and client theme controls\./,
  );
  assert.match(html, /Loading gateway config\.\.\./);
  assert.match(html, /Loading cron jobs\.\.\./);
});
