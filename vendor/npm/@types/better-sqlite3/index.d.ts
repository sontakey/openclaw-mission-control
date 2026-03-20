declare namespace Database {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement<Result = unknown> {
    all(...params: unknown[]): Result[];
    get(...params: unknown[]): Result;
    run(...params: unknown[]): RunResult;
  }

  interface Database {
    close(): void;
    exec(sql: string): this;
    pragma(source: string): unknown;
    prepare<Result = unknown>(sql: string): Statement<Result>;
  }
}

declare const Database: {
  new (filename?: string, options?: unknown): Database.Database;
  prototype: Database.Database;
};

export = Database;
