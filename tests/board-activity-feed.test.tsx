import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { AppShell } from "../src/App.tsx";

test("board dashboard renders the recent activity panel with the last 10 item limit", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <AppShell />
    </MemoryRouter>,
  );

  assert.match(html, /Recent Activity/);
  assert.match(html, /Latest 10 updates from the mission feed\./);
  assert.match(html, /Loading activity\.\.\./);
  assert.match(html, /Open Full Feed/);
});
