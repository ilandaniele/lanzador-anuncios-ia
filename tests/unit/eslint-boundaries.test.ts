// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function lintRules(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((message) => message.ruleId) ?? [];
}

describe("eslint import boundaries", { timeout: 30_000 }, () => {
  it.each(["chat", "ai"])(
    "services/%s cannot import integrations/meta/write",
    async (service) => {
      const rules = await lintRules(
        `src/api/services/${service}/probe.ts`,
        `import { createCampaign } from "../../../integrations/meta/write";\nexport { createCampaign };\n`,
      );
      expect(rules).toContain("no-restricted-imports");
    },
  );

  it("services cannot import db/schema", async () => {
    const rules = await lintRules(
      "src/api/services/launches/probe.ts",
      `import { users } from "../../../db/schema/auth";\nexport { users };\n`,
    );
    expect(rules).toContain("no-restricted-imports");
  });

  it("repositories can import db/schema", async () => {
    const rules = await lintRules(
      "src/api/repositories/probe.ts",
      `import { users } from "../../db/schema/auth";\nexport { users };\n`,
    );
    expect(rules).not.toContain("no-restricted-imports");
  });
});
