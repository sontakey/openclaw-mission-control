import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const layoutDir = join(process.cwd(), "src/components/layout");
const providersDir = join(process.cwd(), "src/providers");

async function readSourceFiles(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.flatMap((entry) => {
      if (entry.isDirectory()) {
        return readSourceFiles(join(root, entry.name));
      }

      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
        return [];
      }

      return [
        readFile(join(root, entry.name), "utf8").then((content) => ({
          content,
          path: join(root, entry.name),
        })),
      ];
    }),
  );

  return files.flat();
}

test("layout and provider files drop Clawe and Next.js client imports", async () => {
  const files = [
    ...(await readSourceFiles(layoutDir)),
    ...(await readSourceFiles(providersDir)),
  ];

  for (const file of files) {
    assert.doesNotMatch(file.content, /@clawe/, `${file.path} still references @clawe`);
    assert.doesNotMatch(file.content, /next\/link/, `${file.path} still references next/link`);
    assert.doesNotMatch(
      file.content,
      /next\/navigation/,
      `${file.path} still references next/navigation`,
    );
    assert.doesNotMatch(
      file.content,
      /^["']use client["'];\n/m,
      `${file.path} still declares use client`,
    );
  }
});

test("unused auth and squad-switching layout files are removed", async () => {
  await assert.rejects(access(join(layoutDir, "nav-user.tsx")));
  await assert.rejects(access(join(layoutDir, "squad-switcher.tsx")));
  await assert.rejects(access(join(layoutDir, "nav-settings.tsx")));
  await assert.rejects(access(join(layoutDir, "sidebar-nav-provider.tsx")));
});
