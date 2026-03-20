import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";

const uiDir = join(process.cwd(), "src/components/ui");

async function readUiFiles() {
  const entries = await readdir(uiDir);
  const files = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".tsx"))
      .map(async (entry) => ({
        content: await readFile(join(uiDir, entry), "utf8"),
        name: entry,
      })),
  );

  return files.sort((left, right) => left.name.localeCompare(right.name));
}

test("ui components do not keep @clawe imports or use client directives", async () => {
  const files = await readUiFiles();

  for (const file of files) {
    assert.doesNotMatch(file.content, /@clawe/, `${file.name} still references @clawe`);
    assert.doesNotMatch(
      file.content,
      /^"use client";\n/m,
      `${file.name} still declares use client`,
    );
  }
});

test("ui components using cn import it from @/lib/utils", async () => {
  const files = await readUiFiles();

  for (const file of files) {
    if (!file.content.includes("cn(")) {
      continue;
    }

    assert.match(
      file.content,
      /from "@\/lib\/utils"/,
      `${file.name} should import cn from @/lib/utils`,
    );
  }
});

test("ui component cross-references stay local", async () => {
  const files = await readUiFiles();
  const uiModuleNames = new Set(
    files.map((file) => file.name.replace(/\.tsx$/, "")),
  );
  const importsByFile = new Map(
    files.map((file) => [
      file.name,
      Array.from(file.content.matchAll(/from "([^"]+)"/g), (match) => match[1]),
    ]),
  );

  const expectedImports: Record<string, string[]> = {
    "alert-dialog.tsx": ["./button"],
    "combobox.tsx": ["./button", "./input-group"],
    "dialog.tsx": ["./button"],
    "input-group.tsx": ["./button", "./input", "./textarea"],
    "sidebar.tsx": [
      "./button",
      "./input",
      "./separator",
      "./sheet",
      "./skeleton",
      "./tooltip",
      "@/hooks/use-mobile",
    ],
  };

  for (const [fileName, expectedSources] of Object.entries(expectedImports)) {
    const imports = importsByFile.get(fileName);

    assert.ok(imports, `${fileName} was not found`);

    for (const source of expectedSources) {
      assert.ok(imports.includes(source), `${fileName} should import ${source}`);
    }
  }

  for (const [fileName, imports] of importsByFile) {
    for (const source of imports) {
      if (!source.startsWith(".") && !source.startsWith("@/")) {
        continue;
      }

      const target = basename(source);

      if (!uiModuleNames.has(target)) {
        continue;
      }

      assert.ok(
        source.startsWith("./") || source.startsWith("@/components/ui/"),
        `${fileName} should import ${target} via ./ or @/components/ui/, found ${source}`,
      );
    }
  }
});
