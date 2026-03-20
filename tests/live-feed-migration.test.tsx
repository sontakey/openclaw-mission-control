import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFile(join(root, path), "utf8");
}

test("live-feed components use local hooks and imports instead of Convex", async () => {
  const [feed, item, types, index] = await Promise.all([
    readProjectFile("src/components/live-feed/live-feed.tsx"),
    readProjectFile("src/components/live-feed/live-feed-item.tsx"),
    readProjectFile("src/components/live-feed/types.ts"),
    readProjectFile("src/components/live-feed/index.ts"),
  ]);

  for (const [name, content] of Object.entries({
    "live-feed.tsx": feed,
    "live-feed-item.tsx": item,
    "types.ts": types,
  })) {
    assert.doesNotMatch(
      content,
      /^"use client";\n/m,
      `${name} still declares use client`,
    );
    assert.doesNotMatch(content, /@clawe|convex\/react/, `${name} still references Clawe or Convex`);
  }

  assert.match(feed, /useActivities\(limit\)/, "live-feed.tsx should use useActivities(limit)");
  assert.match(
    feed,
    /from "@\/hooks\/useActivities"/,
    "live-feed.tsx should import useActivities from @/hooks/useActivities",
  );
  assert.match(
    feed,
    /from "@\/components\/ui\/scroll-area"/,
    "live-feed.tsx should import ScrollArea from @/components/ui/scroll-area",
  );
  assert.match(
    item,
    /from "@\/lib\/utils"/,
    "live-feed-item.tsx should import cn from @/lib/utils",
  );
  assert.match(
    types,
    /from "@\/lib\/types"/,
    "types.ts should import feed types from @/lib/types",
  );
  assert.match(
    index,
    /export \{ LiveFeed, LiveFeedTitle \} from "\.\/live-feed"/,
    "index.ts should export the live-feed entry points",
  );
});
