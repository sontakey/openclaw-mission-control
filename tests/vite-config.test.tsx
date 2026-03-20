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

test("vite proxies api requests to the local mission control server in dev", () => {
  const proxy = viteConfig.server?.proxy;

  assert.ok(proxy);
  assert.ok("/api" in proxy);

  const apiProxy = proxy["/api"];

  assert.equal(typeof apiProxy, "object");
  assert.ok(apiProxy);
  assert.equal(apiProxy.target, "http://127.0.0.1:3000");
});
