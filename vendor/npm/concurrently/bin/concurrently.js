#!/usr/bin/env node

import { spawn } from "node:child_process";

const commands = process.argv.slice(2);

if (commands.length === 0) {
  console.error("concurrently: no commands provided");
  process.exit(1);
}

const children = commands.map((command) =>
  spawn(command, {
    env: process.env,
    shell: true,
    stdio: "inherit",
  }),
);

let settled = false;

function stopChildren(signal) {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (settled) {
      return;
    }

    settled = true;
    stopChildren("SIGTERM");

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

process.on("SIGINT", () => {
  stopChildren("SIGINT");
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopChildren("SIGTERM");
  process.exit(143);
});
