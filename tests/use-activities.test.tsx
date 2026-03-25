import assert from "node:assert/strict";
import test from "node:test";

import {
  ActivitiesStore,
  createActivitiesApi,
  normalizeActivity,
  type ActivitiesApi,
} from "../src/hooks/useActivities.ts";
import type { Activity } from "../src/lib/types.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

type FetchCall = {
  init: Parameters<typeof fetch>[1];
  input: Parameters<typeof fetch>[0];
};

function setWindowOrigin(origin: string) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        origin,
      },
    },
  });
}

function mockFetch(responses: Response[]) {
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input, init) => {
    calls.push({ init, input });

    const response = responses.shift();

    if (!response) {
      throw new Error("No mock response available.");
    }

    return response;
  }) as typeof fetch;

  return calls;
}

function createActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    agent_id: "agent-1",
    created_at: 1_710_000_000,
    id: "activity-1",
    message: 'Created task "Fix bug".',
    metadata: null,
    task_id: "task-1",
    type: "task_created",
    ...overrides,
  };
}

function createMockActivityEventSource() {
  let listener: ((event: { activity: Activity; type: "activity" }) => void) | null =
    null;

  return {
    emit(activity: Activity) {
      listener?.({ activity, type: "activity" });
    },
    subscribe(
      type: "activity",
      nextListener: (event: { activity: Activity; type: "activity" }) => void,
    ) {
      assert.equal(type, "activity");
      listener = nextListener;

      return () => {
        listener = null;
      };
    },
  };
}

test.beforeEach(() => {
  setWindowOrigin("http://localhost:4173");
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("activities API helper fetches /api/activities with the requested limit", async () => {
  const activity = createActivity();
  const calls = mockFetch([
    new Response(JSON.stringify({ activities: [activity] }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
  ]);
  const api = createActivitiesApi();

  const activities = await api.listActivities(25);

  assert.deepEqual(activities, [activity]);
  assert.deepEqual(calls, [
    {
      init: {
        headers: new Headers({
          Accept: "application/json",
        }),
        method: "GET",
      },
      input: "http://localhost:4173/api/activities?limit=25",
    },
  ]);
});

test("normalizeActivity maps activity timestamps and preserves live-feed fields", () => {
  const normalized = normalizeActivity(
    createActivity({
      agent_id: "agent-7",
      created_at: 1_710_000_000,
      message: 'Updated subtask "Ship fix" on "Fix bug".',
    }),
  );

  assert.equal(normalized._id, "activity-1");
  assert.equal(normalized.createdAt, 1_710_000_000_000);
  assert.equal(normalized.agent?.name, "agent-7");
  assert.equal(normalized.task?.title, "Ship fix");
});

test("ActivitiesStore loads the initial feed and prepends SSE activity updates", async () => {
  const initialActivity = createActivity();
  const nextActivity = createActivity({
    created_at: 1_710_000_100,
    id: "activity-2",
    message: 'Alpha commented on "Fix bug".',
    type: "message_sent",
  });
  const activityEvents = createMockActivityEventSource();
  const api: ActivitiesApi = {
    async listActivities() {
      return [initialActivity];
    },
  };
  const store = new ActivitiesStore({
    api,
    limit: 2,
    sse: activityEvents,
  });

  await store.start();

  assert.equal(store.getSnapshot().status, "ready");
  assert.equal(store.getSnapshot().activities?.length, 1);
  assert.equal(store.getSnapshot().activities?.[0]?.task?.title, "Fix bug");

  activityEvents.emit(nextActivity);
  activityEvents.emit(nextActivity);

  assert.equal(store.getSnapshot().activities?.length, 2);
  assert.deepEqual(
    store.getSnapshot().activities?.map((activity) => activity.id),
    ["activity-2", "activity-1"],
  );
  assert.equal(store.getSnapshot().activities?.[0]?.createdAt, 1_710_000_100_000);

  store.stop();
});

test("ActivitiesStore trims the initial feed to the requested limit", async () => {
  const api: ActivitiesApi = {
    async listActivities() {
      return [
        createActivity({ id: "activity-3", message: 'Created task "Task 03".' }),
        createActivity({ id: "activity-2", message: 'Created task "Task 02".' }),
        createActivity({ id: "activity-1", message: 'Created task "Task 01".' }),
      ];
    },
  };
  const store = new ActivitiesStore({
    api,
    limit: 2,
  });

  await store.start();

  assert.deepEqual(
    store.getSnapshot().activities?.map((activity) => activity.id),
    ["activity-3", "activity-2"],
  );

  store.stop();
});
