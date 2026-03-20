import Database from "better-sqlite3";

export const DATABASE_FILE = process.env.DATABASE_FILE ?? "mission-control.db";

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
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
    metadata TEXT,
    parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    done_at INTEGER,
    assignee_agent_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'in_progress', 'done', 'blocked')),
    blocked_reason TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'comment'
      CHECK (type IN ('comment', 'status_change', 'system')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    type TEXT NOT NULL,
    agent_id TEXT,
    task_id TEXT,
    message TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_activities_created
    ON activities(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_activities_agent
    ON activities(agent_id);
`;

const TASK_PARENT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id
    ON tasks(parent_task_id);
`;

export type MissionControlDatabase = Database.Database;

type TableInfoRow = {
  name: string;
};

let database: MissionControlDatabase | undefined;

function hasColumn(
  db: MissionControlDatabase,
  tableName: string,
  columnName: string,
) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return columns.some((column) => column.name === columnName);
}

function migrateDatabase(db: MissionControlDatabase) {
  if (!hasColumn(db, "tasks", "parent_task_id")) {
    db.exec(`
      ALTER TABLE tasks
      ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
    `);
  }

  db.exec(TASK_PARENT_INDEX_SQL);
}

export function createDatabase(filename = DATABASE_FILE) {
  const db = new Database(filename);

  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  migrateDatabase(db);

  return db;
}

export function getDatabase() {
  database ??= createDatabase();
  return database;
}
