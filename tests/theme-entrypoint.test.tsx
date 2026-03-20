import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("globals.css uses the teal brand tokens from the adaptation guide", async () => {
  const content = await readFile("src/styles/globals.css", "utf8");

  assert.match(content, /--brand:\s*oklch\(0\.65 0\.15 180\);/);
  assert.match(content, /--brand-foreground:\s*oklch\(1 0 0\);/);
  assert.match(content, /--brand:\s*oklch\(0\.72 0\.14 180\);/);
  assert.match(content, /--brand-foreground:\s*oklch\(0\.13 0 0\);/);
});

test("globals.css preserves the kanban scroll area override", async () => {
  const content = await readFile("src/styles/globals.css", "utf8");

  assert.match(content, /\[data-radix-scroll-area-viewport\] > div\s*\{/);
  assert.match(content, /display:\s*block !important;/);
});

test("main.tsx imports globals.css and renders App without BrowserRouter", async () => {
  const content = await readFile("src/main.tsx", "utf8");

  assert.match(content, /import "\.\/styles\/globals\.css";/);
  assert.match(content, /<App \/>/);
  assert.doesNotMatch(content, /BrowserRouter/);
});
