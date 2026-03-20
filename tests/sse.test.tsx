import assert from "node:assert/strict";
import test from "node:test";

import { SseBroadcastManager, type SseClient } from "../server/sse.js";

function createClient() {
  const headers = new Map<string, string>();
  const writes: string[] = [];
  let statusCode: number | undefined;
  let flushCount = 0;

  const client: SseClient = {
    flushHeaders() {
      flushCount += 1;
    },
    setHeader(name, value) {
      headers.set(name, String(value));
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    write(chunk) {
      writes.push(String(chunk));
      return true;
    },
  };

  return {
    client,
    get flushCount() {
      return flushCount;
    },
    headers,
    get statusCode() {
      return statusCode;
    },
    writes,
  };
}

test("SseBroadcastManager adds SSE headers and sends a handshake comment", () => {
  const manager = new SseBroadcastManager();
  const client = createClient();

  manager.addClient(client.client);

  assert.equal(client.statusCode, 200);
  assert.equal(client.headers.get("Content-Type"), "text/event-stream");
  assert.equal(client.headers.get("Cache-Control"), "no-cache, no-transform");
  assert.equal(client.headers.get("Connection"), "keep-alive");
  assert.equal(client.headers.get("X-Accel-Buffering"), "no");
  assert.equal(client.flushCount, 1);
  assert.deepEqual(client.writes, [": connected\n\n"]);
});

test("SseBroadcastManager broadcasts typed events to connected clients only", () => {
  const manager = new SseBroadcastManager();
  const firstClient = createClient();
  const secondClient = createClient();

  manager.addClient(firstClient.client);
  manager.addClient(secondClient.client);
  manager.removeClient(secondClient.client);
  manager.broadcast("task_deleted", { taskId: "task-123" });

  assert.equal(firstClient.writes.at(-1), 'event: task_deleted\ndata: {"taskId":"task-123"}\n\n');
  assert.deepEqual(secondClient.writes, [": connected\n\n"]);
});
