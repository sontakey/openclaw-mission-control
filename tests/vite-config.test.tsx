import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import viteConfig from "../vite.config.ts";

test("vite @ alias resolves to src", () => {
  const alias = viteConfig.resolve?.alias;

  assert.ok(alias);
  assert.ok(!Array.isArray(alias));
  assert.equal(alias["@"], resolve(process.cwd(), "src"));
});
