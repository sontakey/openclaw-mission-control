import assert from "node:assert/strict";
import test from "node:test";

import { SseConnection } from "../src/hooks/useSSE.ts";

class FakeEventSource {
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly url: string;

  readyState = 0;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.readyState = 2;
  }

  emit(type: string, event: unknown = {}) {
    if (type === "open") {
      this.readyState = 1;
    }

    if (type === "error") {
      this.readyState = 2;
    }

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

test("SseConnection parses named events and dispatches them to subscribers", () => {
  const sources: FakeEventSource[] = [];
  const connection = new SseConnection({
    eventSourceFactory(url) {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
  });
  const events: Array<{ task: { id: string }; type: string }> = [];

  connection.subscribe("task_updated", (event) => {
    events.push({
      task: {
        id: String(event.task.id),
      },
      type: event.type,
    });
  });

  connection.connect();

  assert.equal(connection.getSnapshot(), "connecting");
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.url, "/api/activities/stream");

  sources[0]?.emit("open");
  assert.equal(connection.getSnapshot(), "open");

  sources[0]?.emit("task_updated", {
    data: JSON.stringify({
      task: { id: "task-1" },
    }),
  });

  assert.deepEqual(events, [
    {
      task: { id: "task-1" },
      type: "task_updated",
    },
  ]);

  connection.disconnect();
  assert.equal(connection.getSnapshot(), "closed");
  assert.equal(sources[0]?.readyState, 2);
});

test("SseConnection reconnects after disconnect events", async () => {
  const sources: FakeEventSource[] = [];
  const connection = new SseConnection({
    eventSourceFactory(url) {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
    reconnectDelayMs: 5,
  });

  connection.connect();
  assert.equal(sources.length, 1);

  sources[0]?.emit("error");
  assert.equal(connection.getSnapshot(), "connecting");
  assert.equal(sources[0]?.readyState, 2);

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(sources.length, 2);

  connection.disconnect();
});
