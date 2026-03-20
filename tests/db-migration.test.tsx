import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import Database from "better-sqlite3";

import { createDatabase } from "../server/db.ts";

type IndexListRow = {
  name: string;
};

type TableInfoRow = {
  name: string;
};

function getTaskColumnNames(db: Database.Database) {
  return (db.prepare("PRAGMA table_info(tasks)").all() as TableInfoRow[]).map(
    (column) => column.name,
  );
}

function getTaskIndexNames(db: Database.Database) {
  return (db.prepare("PRAGMA index_list(tasks)").all() as IndexListRow[]).map(
    (index) => index.name,
  );
}

test("createDatabase adds parent_task_id and its index for new databases", (t) => {
  const db = createDatabase(":memory:");
  t.after(() => {
    db.close();
  });

  assert.equal(getTaskColumnNames(db).includes("parent_task_id"), true);
  assert.equal(getTaskIndexNames(db).includes("idx_tasks_parent_task_id"), true);
});

test("createDatabase migrates existing task tables without disturbing rows", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mission-control-db-"));
  const filename = join(directory, "legacy.db");
  t.after(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  const legacyDb = new Database(filename);
  legacyDb.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'inbox'
        CHECK (status IN ('inbox', 'assigned', 'in_progress', 'review', 'done')),
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      assignee_agent_id TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at INTEGER,
      metadata TEXT
    );

    INSERT INTO tasks (
      id,
      title,
      description,
      status,
      priority,
      assignee_agent_id,
      created_by,
      created_at,
      updated_at,
      completed_at,
      metadata
    )
    VALUES (
      'task-1',
      'Legacy task',
      'Carry existing rows forward',
      'in_progress',
      'high',
      'agent-7',
      'operator',
      10,
      20,
      NULL,
      '{"source":"legacy"}'
    );
  `);
  legacyDb.close();

  const db = createDatabase(filename);

  assert.equal(getTaskColumnNames(db).includes("parent_task_id"), true);
  assert.equal(getTaskIndexNames(db).includes("idx_tasks_parent_task_id"), true);
  assert.deepEqual(
    db.prepare(
      "SELECT id, title, description, metadata, parent_task_id FROM tasks WHERE id = ?",
    ).get("task-1"),
    {
      description: "Carry existing rows forward",
      id: "task-1",
      metadata: '{"source":"legacy"}',
      parent_task_id: null,
      title: "Legacy task",
    },
  );

  db.close();

  const reopenedDb = createDatabase(filename);

  assert.equal(getTaskColumnNames(reopenedDb).includes("parent_task_id"), true);
  assert.equal(getTaskIndexNames(reopenedDb).includes("idx_tasks_parent_task_id"), true);
  reopenedDb.close();
});
