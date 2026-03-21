import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package scripts keep client and server dev workflows separate", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["dev:server"], "tsx watch server/index.ts");
  assert.equal(packageJson.scripts?.dev, "vite");
  assert.equal(
    packageJson.scripts?.["dev:full"],
    'concurrently "vite" "tsx watch server/index.ts"',
  );
  assert.equal(
    packageJson.scripts?.start,
    "node dist/server/server/index.js",
  );
});
