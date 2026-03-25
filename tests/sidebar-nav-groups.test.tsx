import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { AppShell } from "../src/App.tsx";

test("board route groups sidebar navigation under overview, tools, and system headers", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(
    html,
    />OVERVIEW<[\s\S]*lucide-layout-dashboard[\s\S]*>Dashboard<[\s\S]*href="\/board"[\s\S]*>Agents<[\s\S]*>TOOLS<[\s\S]*href="\/chat"[\s\S]*>Crons<[\s\S]*>SYSTEM<[\s\S]*>Settings</,
  );
});

test("chat route keeps the grouped sidebar navigation", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/chat"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, />OVERVIEW</);
  assert.match(html, />TOOLS</);
  assert.match(html, />SYSTEM</);
});
