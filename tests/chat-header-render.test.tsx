import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChatHeader } from "../src/components/chat/chat-header.tsx";

test("ChatHeader renders an agent selector with the available sessions", () => {
  const html = renderToStaticMarkup(
    <ChatHeader
      agentOptions={[
        {
          label: "Alpha",
          sessionKey: "agent:alpha:main",
        },
        {
          label: "Beta",
          sessionKey: "agent:beta:main",
        },
      ]}
      selectedSessionKey="agent:beta:main"
    />,
  );

  assert.match(html, /Agent/);
  assert.match(html, /<select/);
  assert.match(html, /Alpha/);
  assert.match(html, /Beta/);
  assert.match(html, /selected/);
});
