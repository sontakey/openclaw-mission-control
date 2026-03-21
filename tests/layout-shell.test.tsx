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
  assert.match(html, /href="\/chat"/);
  assert.match(html, />Crons</);
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
  assert.match(html, /href="\/chat"/);
  assert.match(html, />Crons</);
  assert.match(html, />Settings</);
  assert.match(html, /Gateway connection/);
  assert.match(html, /Use light theme/);
  assert.match(
    html,
    /Gateway connection details and client theme controls\./,
  );
  assert.match(html, /Loading gateway config\.\.\./);
});

test("agents route keeps the top-level sidebar navigation", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/agents"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, /Mission Control/);
  assert.match(html, />Board</);
  assert.match(html, />Agents</);
  assert.match(html, /href="\/chat"/);
  assert.match(html, />Crons</);
  assert.match(html, />Settings</);
  assert.match(html, /Squad/);
  assert.match(html, /Your AI agents and their current status\./);
});

test("chat route renders a dedicated chat page inside the shared shell", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/chat"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, /Mission Control/);
  assert.match(html, />Board</);
  assert.match(html, />Agents</);
  assert.match(html, /href="\/chat"/);
  assert.match(html, />Crons</);
  assert.match(html, />Settings</);
  assert.match(html, />Chat</);
  assert.match(html, /Message agent sessions without leaving Mission Control\./);
  assert.match(html, /Start a conversation/);
});

test("crons route renders dedicated cron jobs page inside the shell", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/crons"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, /Mission Control/);
  assert.match(html, />Board</);
  assert.match(html, />Agents</);
  assert.match(html, />Crons</);
  assert.match(html, />Settings</);
  assert.match(html, /Cron Jobs/);
  assert.match(html, /Gateway cron jobs/);
  assert.match(html, /Loading cron jobs\.\.\./);
});
