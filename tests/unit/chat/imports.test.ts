import { describe, expect, it } from "vitest";

const META_WRITE = "/src/api/integrations/meta/write.ts";
const CHAT_DIR = "/src/api/services/chat/";

const sources = import.meta.glob("/src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const IMPORT_PATTERN = /(?:import|export)[^"']*?from\s*["']([^"']+)["']/g;

function resolveImport(from: string, specifier: string, known: Set<string>) {
  if (!specifier.startsWith(".")) return null;
  const base = new URL(specifier, `file://${from}`).pathname;
  return [`${base}.ts`, `${base}/index.ts`, base].find((path) =>
    known.has(path),
  );
}

function reachableFrom(
  graphSources: Record<string, string>,
  entries: string[],
): Set<string> {
  const known = new Set(Object.keys(graphSources));
  const seen = new Set<string>();
  const pending = [...entries];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, specifier] of graphSources[file]!.matchAll(IMPORT_PATTERN)) {
      const target = resolveImport(file, specifier!, known);
      if (target && !seen.has(target)) pending.push(target);
    }
  }
  return seen;
}

const chatEntries = (graphSources: Record<string, string>) =>
  Object.keys(graphSources).filter((path) => path.startsWith(CHAT_DIR));

describe("services/chat import boundary", () => {
  it("finds the chat agent and tools", () => {
    expect(chatEntries(sources)).toEqual(
      expect.arrayContaining([`${CHAT_DIR}agent.ts`, `${CHAT_DIR}tools.ts`]),
    );
  });

  it("never reaches integrations/meta/write, directly or transitively", () => {
    expect(reachableFrom(sources, chatEntries(sources)).has(META_WRITE)).toBe(
      false,
    );
  });

  it("detects a chat module that imports meta/write through a helper", () => {
    const probe = {
      ...sources,
      [`${CHAT_DIR}probe.ts`]: `import { helper } from "../launch/probe-helper";\n`,
      "/src/api/services/launch/probe-helper.ts": `export { setStatus as helper } from "../../integrations/meta/write";\n`,
    };

    expect(reachableFrom(probe, chatEntries(probe)).has(META_WRITE)).toBe(true);
  });
});
