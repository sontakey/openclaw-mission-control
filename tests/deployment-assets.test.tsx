import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import test from "node:test";

test("deployment assets cover installer, environment, and docs", async () => {
  const [installScript, envExample, readme, gitignore] = await Promise.all([
    readFile("install.sh", "utf8"),
    readFile(".env.example", "utf8"),
    readFile("README.md", "utf8"),
    readFile(".gitignore", "utf8"),
  ]);

  assert.match(installScript, /MISSION_CONTROL_DIR/);
  assert.match(installScript, /MISSION_CONTROL_PORT/);
  assert.match(installScript, /OPENCLAW_GATEWAY_URL/);
  assert.match(installScript, /OPENCLAW_TOKEN/);
  assert.match(installScript, /DATABASE_FILE/);
  assert.match(installScript, /git clone/);
  assert.match(installScript, /run build/);
  assert.match(installScript, /systemctl enable --now/);

  assert.match(envExample, /^PORT=3100$/m);
  assert.match(envExample, /^OPENCLAW_GATEWAY_URL=http:\/\/127\.0\.0\.1:18789$/m);
  assert.match(envExample, /^OPENCLAW_TOKEN=$/m);
  assert.match(envExample, /^DATABASE_FILE=mission-control\.db$/m);

  assert.match(gitignore, /^node_modules$/m);
  assert.match(gitignore, /^dist$/m);
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\*\.db$/m);

  assert.match(readme, /^# Mission Control$/m);
  assert.match(readme, /^## Architecture Overview$/m);
  assert.match(readme, /^## Local Setup$/m);
  assert.match(readme, /^## Production Install$/m);
  assert.match(readme, /server\/routes\/tasks\.ts/);
  assert.match(readme, /install\.sh/);
  assert.match(readme, /\.env\.example/);
});

test("installer stays executable and adaptation reference files are removed", async () => {
  await access("install.sh", constants.X_OK);
  await assert.rejects(access("reference"));
});
