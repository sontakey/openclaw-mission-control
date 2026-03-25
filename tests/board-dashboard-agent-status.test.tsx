import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { AppShell } from "../src/App.tsx";

test("board dashboard renders the agent status section", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, /Agent Status/);
  assert.match(html, /No agents are reporting yet\./);
});
