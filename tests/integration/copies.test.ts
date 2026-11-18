import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { aiUsage } from "../../src/db/schema/ops";
import { workspaces } from "../../src/db/schema/workspaces";
import { COPY_LIMITS } from "../../src/shared/constants";
import {
  copiesPageSchema,
  copyResponseSchema,
  generatedCopiesSchema,
} from "../../src/shared/schemas/copies";
import {
  api,
  createProduct,
  createProductCopy,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import { FakeAiProvider } from "../helpers/fake-ai-provider";
import { seedWorkspaceWithRoles } from "../helpers/tenant-pair";
import { openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const openLimits = {
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_EXP: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

const copiesPath = (workspaceId: string, productId: string, suffix = "") =>
  `/api/w/${workspaceId}/products/${productId}/copies${suffix}`;

const copyPath = (workspaceId: string, copyId: string) =>
  `/api/w/${workspaceId}/copies/${copyId}`;

const variant = (overrides: Record<string, unknown> = {}) => ({
  primaryText: "Texto corto y claro",
  headline: "Titular corto",
  description: "Descripción corta",
  policyRisk: "none",
  policyNote: "",
  ...overrides,
});

const reply = (variants: unknown[]) => ({
  text: JSON.stringify({ variants }),
});

const fiveVariants = () =>
  Array.from({ length: 5 }, (_, index) =>
    variant({ headline: `Titular ${index}` }),
  );

const withFirst = (first: Record<string, unknown>) => [
  variant(first),
  ...fiveVariants().slice(1),
];

const generate = (
  workspaceId: string,
  productId: string,
  provider: FakeAiProvider,
  { body = { angle: "dolor" }, ...options }: Caller = {},
) =>
  api(app, copiesPath(workspaceId, productId, "/generate"), {
    method: "POST",
    body,
    ...options,
    env: { ...openLimits, AI_PROVIDER: provider, ...options.env },
  });

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: openLimits, ...options });

const json = async (response: Response) => response.json();

const seed = async () => {
  const { workspace, owner } = await createWorkspace();
  const product = await createProduct(workspace.id);
  return { workspace, owner, product };
};

const usageRows = (workspaceId: string) =>
  db.select().from(aiUsage).where(eq(aiUsage.workspaceId, workspaceId));

describe("POST /products/:id/copies/generate", () => {
  it("saves five suggested AI copies with policy risk", async () => {
    const { workspace, owner, product } = await seed();
    const provider = new FakeAiProvider({
      generateText: [
        reply(
          withFirst({
            policyRisk: "high",
            policyNote: "Promesa de resultados",
          }),
        ),
      ],
    });

    const response = await generate(workspace.id, product.id, provider, {
      as: owner,
      body: { angle: "libre", customAngle: "tono canchero" },
    });

    expect(response.status).toBe(200);
    const { data } = generatedCopiesSchema.parse(await json(response));
    expect(data).toHaveLength(5);
    expect(data[0]).toMatchObject({
      productId: product.id,
      angle: "libre",
      customAngle: "tono canchero",
      source: "ai",
      status: "suggested",
      edited: false,
      overLimit: false,
    });
    expect(
      data.map(({ policyRisk, policyNote }) => [policyRisk, policyNote]),
    ).toContainEqual(["high", "Promesa de resultados"]);

    const [call] = provider.callsTo("generateText");
    expect(call!.input).toMatchObject({
      json: true,
      system: expect.stringContaining("rioplatense"),
      prompt: expect.stringContaining("tono canchero"),
    });
    expect(call!.input).toMatchObject({
      prompt: expect.stringContaining(product.name),
    });
  });

  it("records the usage after the call", async () => {
    const { workspace, owner, product } = await seed();
    const provider = new FakeAiProvider({
      generateText: [reply(fiveVariants())],
    });

    await generate(workspace.id, product.id, provider, { as: owner });

    expect(await usageRows(workspace.id)).toMatchObject([
      {
        feature: "copy",
        userId: owner.id,
        refId: product.id,
        neurons: 1,
        status: "ok",
      },
    ]);
  });

  it("retries once when a text exceeds the limits and keeps the fixed copies", async () => {
    const { workspace, owner, product } = await seed();
    const tooLong = "x".repeat(COPY_LIMITS.headline + 1);
    const provider = new FakeAiProvider({
      generateText: [
        reply(withFirst({ headline: tooLong })),
        reply(fiveVariants()),
      ],
    });

    const response = await generate(workspace.id, product.id, provider, {
      as: owner,
    });

    const { data } = generatedCopiesSchema.parse(await json(response));
    expect(provider.callsTo("generateText")).toHaveLength(2);
    expect(data.some((copy) => copy.overLimit)).toBe(false);
    expect(await usageRows(workspace.id)).toHaveLength(2);
  });

  it("flags over_limit when the retry still exceeds and never retries twice", async () => {
    const { workspace, owner, product } = await seed();
    const tooLong = "x".repeat(COPY_LIMITS.primaryText + 1);
    const stillLong = reply(withFirst({ primaryText: tooLong }));
    const provider = new FakeAiProvider({
      generateText: [stillLong, stillLong, stillLong],
    });

    const response = await generate(workspace.id, product.id, provider, {
      as: owner,
    });

    const { data } = generatedCopiesSchema.parse(await json(response));
    expect(provider.callsTo("generateText")).toHaveLength(2);
    expect(data.filter((copy) => copy.overLimit)).toHaveLength(1);
    expect(data.find((copy) => copy.overLimit)?.primaryText).toBe(tooLong);
  });

  it("answers 502 AI_UPSTREAM when the reply is not valid JSON", async () => {
    const { workspace, owner, product } = await seed();
    const provider = new FakeAiProvider({
      generateText: [{ text: "no es json" }],
    });

    const response = await generate(workspace.id, product.id, provider, {
      as: owner,
    });

    await expectError(response, 502, "AI_UPSTREAM");
    expect(await usageRows(workspace.id)).toHaveLength(1);
  });

  it("answers 502 AI_UPSTREAM when the reply is out of schema or short", async () => {
    const { workspace, owner, product } = await seed();
    const outOfSchema = new FakeAiProvider({
      generateText: [reply([{ headline: "solo titular" }])],
    });
    const tooFew = new FakeAiProvider({
      generateText: [reply(fiveVariants().slice(0, 3))],
    });

    await expectError(
      await generate(workspace.id, product.id, outOfSchema, { as: owner }),
      502,
      "AI_UPSTREAM",
    );
    await expectError(
      await generate(workspace.id, product.id, tooFew, { as: owner }),
      502,
      "AI_UPSTREAM",
    );
  });

  it("answers 422 AI_BUDGET_EXHAUSTED without calling the AI", async () => {
    const { workspace, owner, product } = await seed();
    await db
      .update(workspaces)
      .set({ aiDailyNeuronsOverride: 0 })
      .where(eq(workspaces.id, workspace.id));
    const provider = new FakeAiProvider();

    const response = await generate(workspace.id, product.id, provider, {
      as: owner,
    });

    await expectError(response, 422, "AI_BUDGET_EXHAUSTED");
    expect(provider.calls).toHaveLength(0);
    expect(await usageRows(workspace.id)).toHaveLength(0);
  });

  it("answers 404 for a product of another workspace without calling the AI", async () => {
    const { workspace, owner } = await seed();
    const { product: foreign } = await seed();
    const provider = new FakeAiProvider();

    const response = await generate(workspace.id, foreign.id, provider, {
      as: owner,
    });

    await expectError(response, 404, "NOT_FOUND");
    expect(provider.calls).toHaveLength(0);
  });

  it("validates the angle before touching the AI", async () => {
    const { workspace, owner, product } = await seed();
    const provider = new FakeAiProvider();

    const response = await generate(workspace.id, product.id, provider, {
      as: owner,
      body: { angle: "misterio" },
    });

    await expectError(response, 400, "VALIDATION");
    expect(provider.calls).toHaveLength(0);
  });

  it("answers 429 when the expensive limiter blocks", async () => {
    const { workspace, owner, product } = await seed();
    const provider = new FakeAiProvider();

    const response = await generate(workspace.id, product.id, provider, {
      as: owner,
      env: { RL_EXP: { limit: async () => ({ success: false }) } },
    });

    await expectError(response, 429, "RATE_LIMITED");
    expect(provider.calls).toHaveLength(0);
  });
});

describe("GET /products/:id/copies", () => {
  const list = async (
    workspaceId: string,
    productId: string,
    owner: Caller["as"],
    query = "",
  ) =>
    copiesPageSchema.parse(
      await json(
        await call(`${copiesPath(workspaceId, productId)}${query}`, {
          as: owner,
        }),
      ),
    );

  it("lists newest first with filters and cursor pagination", async () => {
    const { workspace, owner, product } = await seed();
    const [older, saved, favorite] = await Promise.all([
      createProductCopy(workspace.id, product.id, { createdAt: 1000 }),
      createProductCopy(workspace.id, product.id, {
        createdAt: 2000,
        status: "saved",
      }),
      createProductCopy(workspace.id, product.id, {
        createdAt: 3000,
        status: "saved",
        favorite: 1,
      }),
    ]);
    const idsOf = (page: { data: { id: string }[] }) =>
      page.data.map((copy) => copy.id);

    const all = await list(workspace.id, product.id, owner);
    expect(idsOf(all)).toEqual([favorite.id, saved.id, older.id]);

    const filtered = await list(
      workspace.id,
      product.id,
      owner,
      "?status=saved&favorite=true",
    );
    expect(idsOf(filtered)).toEqual([favorite.id]);

    const firstPage = await list(workspace.id, product.id, owner, "?limit=2");
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await list(
      workspace.id,
      product.id,
      owner,
      `?limit=2&cursor=${firstPage.nextCursor}`,
    );
    expect(idsOf(secondPage)).toEqual([older.id]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("only lists the copies of the requested product", async () => {
    const { workspace, owner, product } = await seed();
    const other = await createProduct(workspace.id);
    await createProductCopy(workspace.id, other.id);

    expect((await list(workspace.id, product.id, owner)).data).toEqual([]);
  });

  it("answers 404 for a product of another workspace", async () => {
    const { workspace, owner } = await seed();
    const { workspace: otherWorkspace, product } = await seed();
    await createProductCopy(otherWorkspace.id, product.id);

    await expectError(
      await call(copiesPath(workspace.id, product.id), { as: owner }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("POST /products/:id/copies", () => {
  it("creates a saved manual copy and flags over-limit text", async () => {
    const { workspace, owner, product } = await seed();

    const response = await call(copiesPath(workspace.id, product.id), {
      as: owner,
      method: "POST",
      body: {
        primaryText: "x".repeat(COPY_LIMITS.primaryText + 1),
        headline: "Titular",
      },
    });

    expect(response.status).toBe(201);
    const { copy } = copyResponseSchema.parse(await json(response));
    expect(copy).toMatchObject({
      angle: "manual",
      source: "manual",
      status: "saved",
      edited: false,
      description: null,
      policyRisk: "none",
      overLimit: true,
    });
  });

  it("rejects an empty headline", async () => {
    const { workspace, owner, product } = await seed();

    await expectError(
      await call(copiesPath(workspace.id, product.id), {
        as: owner,
        method: "POST",
        body: { primaryText: "Texto", headline: " " },
      }),
      400,
      "VALIDATION",
    );
  });

  it("forbids a viewer", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id);

    await expectError(
      await call(copiesPath(workspace.id, product.id), {
        as: users.viewer,
        method: "POST",
        body: { primaryText: "Texto", headline: "Titular" },
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });
});

describe("PATCH /copies/:copyId", () => {
  const patch = (
    workspaceId: string,
    copyId: string,
    owner: Caller["as"],
    body: unknown,
  ) =>
    call(copyPath(workspaceId, copyId), { as: owner, method: "PATCH", body });

  const patched = async (response: Response) =>
    copyResponseSchema.parse(await json(response)).copy;

  it("marks an AI copy as edited when its text changes", async () => {
    const { workspace, owner, product } = await seed();
    const copy = await createProductCopy(workspace.id, product.id, {
      source: "ai",
      angle: "dolor",
      overLimit: 1,
    });

    const updated = await patched(
      await patch(workspace.id, copy.id, owner, { headline: "Otro titular" }),
    );

    expect(updated).toMatchObject({
      headline: "Otro titular",
      edited: true,
      overLimit: false,
    });
  });

  it("keeps edited false when only favorite or status change", async () => {
    const { workspace, owner, product } = await seed();
    const copy = await createProductCopy(workspace.id, product.id, {
      source: "ai",
      angle: "dolor",
    });

    const updated = await patched(
      await patch(workspace.id, copy.id, owner, {
        favorite: true,
        status: "saved",
        headline: copy.headline,
      }),
    );

    expect(updated).toMatchObject({
      favorite: true,
      status: "saved",
      edited: false,
    });
  });

  it("does not mark a manual copy as edited", async () => {
    const { workspace, owner, product } = await seed();
    const copy = await createProductCopy(workspace.id, product.id);

    const updated = await patched(
      await patch(workspace.id, copy.id, owner, { primaryText: "Nuevo" }),
    );

    expect(updated).toMatchObject({ primaryText: "Nuevo", edited: false });
  });

  it("clears the description and recomputes over_limit", async () => {
    const { workspace, owner, product } = await seed();
    const copy = await createProductCopy(workspace.id, product.id, {
      description: "x".repeat(COPY_LIMITS.description + 1),
      overLimit: 1,
    });

    const updated = await patched(
      await patch(workspace.id, copy.id, owner, { description: null }),
    );

    expect(updated).toMatchObject({ description: null, overLimit: false });
  });

  it("rejects an empty patch and an invalid status", async () => {
    const { workspace, owner, product } = await seed();
    const copy = await createProductCopy(workspace.id, product.id);

    await expectError(
      await patch(workspace.id, copy.id, owner, {}),
      400,
      "VALIDATION",
    );
    await expectError(
      await patch(workspace.id, copy.id, owner, { status: "suggested" }),
      400,
      "VALIDATION",
    );
  });

  it("answers 404 for a copy of another workspace", async () => {
    const { workspace, owner } = await seed();
    const { workspace: otherWorkspace, product } = await seed();
    const foreign = await createProductCopy(otherWorkspace.id, product.id);

    await expectError(
      await patch(workspace.id, foreign.id, owner, { favorite: true }),
      404,
      "NOT_FOUND",
    );
  });
});
