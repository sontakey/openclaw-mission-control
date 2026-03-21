import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CronsPageContent, type GatewayCron } from "../src/pages/crons.tsx";
import { ChatPanelProvider } from "../src/providers/chat-panel-provider.tsx";

function renderCronsPage({
  crons,
  error = null,
  isLoading = false,
}: {
  crons: GatewayCron[];
  error?: string | null;
  isLoading?: boolean;
}) {
  return renderToStaticMarkup(
    <ChatPanelProvider>
      <CronsPageContent crons={crons} error={error} isLoading={isLoading} />
    </ChatPanelProvider>,
  );
}

test("crons page renders cron rows and fallback labels", () => {
  const html = renderCronsPage({
    crons: [
      {
        id: "sync-digest",
        isActive: true,
        lastRunAt: null,
        name: "Sync digest",
        nextRunAt: 1735689600000,
        schedule: "*/5 * * * *",
      },
      {
        id: "backfill-queue",
        isActive: false,
        lastRunAt: 1735686000000,
        name: "Backfill queue",
        nextRunAt: null,
        schedule: "0 * * * *",
      },
    ],
  });

  assert.match(html, /Cron Jobs/);
  assert.match(html, /Sync digest/);
  assert.match(html, /Backfill queue/);
  assert.match(html, /Enabled/);
  assert.match(html, /Paused/);
  assert.match(html, /Not scheduled/);
  assert.match(html, /1735689600000|2025/);
});

test("crons page renders empty and error states", () => {
  const emptyHtml = renderCronsPage({
    crons: [],
  });
  assert.match(emptyHtml, /No cron jobs configured\./);

  const errorHtml = renderCronsPage({
    crons: [],
    error: "Gateway unavailable",
  });
  assert.match(errorHtml, /Gateway unavailable/);
});
