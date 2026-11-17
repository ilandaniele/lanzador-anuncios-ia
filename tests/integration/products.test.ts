import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { products } from "../../src/db/schema/products";
import {
  productResponseSchema,
  productsPageSchema,
} from "../../src/shared/schemas/products";
import {
  api,
  createProduct,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import { seedTenantPair, seedWorkspaceWithRoles } from "../helpers/tenant-pair";
import { openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const openLimits = { RL_IP: openLimiter, RL_USER: openLimiter };

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: openLimits, ...options });

const productsPath = (workspaceId: string, suffix = "") =>
  `/api/w/${workspaceId}/products${suffix}`;

const validBody = {
  name: "Zapatillas",
  landingUrl: "https://tienda.example.test/zapatillas",
  primaryText: "Comodas y livianas",
  headline: "Zapatillas urbanas",
  cta: "SHOP_NOW",
  currency: "USD",
};

const create = (workspaceId: string, as: Caller["as"], body: unknown) =>
  call(productsPath(workspaceId), { as, method: "POST", body });

const patch = (
  workspaceId: string,
  id: string,
  as: Caller["as"],
  body: unknown,
) => call(productsPath(workspaceId, `/${id}`), { as, method: "PATCH", body });

const rowOf = (workspaceId: string, id: string) =>
  db
    .select()
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), eq(products.id, id)))
    .then(([row]) => row);

const PRODUCT_KEYS = [
  "archived",
  "breakEvenRoas",
  "costMinor",
  "createdAt",
  "cta",
  "currency",
  "description",
  "headline",
  "id",
  "landingCheckedAt",
  "landingError",
  "landingHttpStatus",
  "landingStatus",
  "landingUrl",
  "name",
  "priceMinor",
  "primaryText",
  "profitPerSaleMinor",
  "updatedAt",
  "utm",
].sort();

const LIST_ITEM_KEYS = [
  "archived",
  "breakEvenRoas",
  "cta",
  "headline",
  "id",
  "landingStatus",
  "landingUrl",
  "name",
  "primaryText",
];

describe("GET /api/w/:wid/products", () => {
  it("returns 401 without a session", async () => {
    const { workspace } = await seedWorkspaceWithRoles();

    await expectError(
      await call(productsPath(workspace.id)),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("lists with the exact DTO keys and computes breakEvenRoas", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    await createProduct(workspace.id, { priceMinor: 10000, costMinor: 5000 });
    await createProduct(workspace.id, { priceMinor: 10000 });

    const response = await call(productsPath(workspace.id), {
      as: users.viewer,
    });

    expect(response.status).toBe(200);
    const page = productsPageSchema.parse(await response.json());
    expect(page.nextCursor).toBeNull();
    expect(page.data).toHaveLength(2);
    for (const item of page.data) {
      expect(Object.keys(item).sort()).toEqual(LIST_ITEM_KEYS);
    }
    expect(page.data.map((item) => item.breakEvenRoas).sort()).toEqual([
      2,
      null,
    ]);
  });

  it("lists only the workspace's own products", async () => {
    const { A, B } = await seedTenantPair();

    const response = await call(productsPath(A.workspace.id), {
      as: A.users.viewer,
    });

    const page = productsPageSchema.parse(await response.json());
    expect(page.data.map((item) => item.id)).toEqual([A.product.id]);
    expect(page.data.map((item) => item.id)).not.toContain(B.product.id);
  });

  it("returns only active products by default and archived on request", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const active = await createProduct(workspace.id);
    const archived = await createProduct(workspace.id, { archived: 1 });

    const defaults = productsPageSchema.parse(
      await (
        await call(productsPath(workspace.id), { as: users.viewer })
      ).json(),
    );
    const onlyArchived = productsPageSchema.parse(
      await (
        await call(`${productsPath(workspace.id)}?archived=true`, {
          as: users.viewer,
        })
      ).json(),
    );
    const explicitActive = productsPageSchema.parse(
      await (
        await call(`${productsPath(workspace.id)}?archived=false`, {
          as: users.viewer,
        })
      ).json(),
    );

    expect(defaults.data.map((item) => item.id)).toEqual([active.id]);
    expect(explicitActive.data.map((item) => item.id)).toEqual([active.id]);
    expect(onlyArchived.data.map((item) => item.id)).toEqual([archived.id]);
    expect(onlyArchived.data[0]?.archived).toBe(true);
  });

  it("rejects an invalid archived value", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(`${productsPath(workspace.id)}?archived=maybe`, {
        as: users.viewer,
      }),
      400,
      "VALIDATION",
    );
  });

  describe("search q", () => {
    const search = async (workspaceId: string, as: Caller["as"], q: string) => {
      const response = await call(
        `${productsPath(workspaceId)}?q=${encodeURIComponent(q)}`,
        { as },
      );
      return productsPageSchema
        .parse(await response.json())
        .data.map((item) => item.name)
        .sort();
    };

    it("matches by name case-insensitively", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      await createProduct(workspace.id, { name: "Zapatillas Rojas" });
      await createProduct(workspace.id, { name: "Camisa" });

      expect(await search(workspace.id, users.viewer, "ZAPAT")).toEqual([
        "Zapatillas Rojas",
      ]);
      expect(await search(workspace.id, users.viewer, "rojas")).toEqual([
        "Zapatillas Rojas",
      ]);
      expect(await search(workspace.id, users.viewer, "nada")).toEqual([]);
    });

    it("treats % and _ as literal characters", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      await createProduct(workspace.id, { name: "Oferta 50% off" });
      await createProduct(workspace.id, { name: "Oferta 50 off" });
      await createProduct(workspace.id, { name: "snake_case" });
      await createProduct(workspace.id, { name: "snakeXcase" });

      expect(await search(workspace.id, users.viewer, "50%")).toEqual([
        "Oferta 50% off",
      ]);
      expect(await search(workspace.id, users.viewer, "e_c")).toEqual([
        "snake_case",
      ]);
      expect(await search(workspace.id, users.viewer, "%")).toEqual([
        "Oferta 50% off",
      ]);
    });
  });

  describe("pagination", () => {
    it("walks every product once, newest update first, through ties", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      const base = Date.now();
      const created = await Promise.all(
        [0, 1, 2, 2, 3].map((offset) =>
          createProduct(workspace.id, { updatedAt: base + offset }),
        ),
      );

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = cursor ? `&cursor=${cursor}` : "";
        const response = await call(
          `${productsPath(workspace.id)}?limit=2${query}`,
          { as: users.viewer },
        );
        const page = productsPageSchema.parse(await response.json());
        seen.push(...page.data.map((item) => item.id));
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(seen).toHaveLength(5);
      expect(new Set(seen)).toEqual(new Set(created.map(({ id }) => id)));
      const updatedAtById = Object.fromEntries(
        created.map(({ id, updatedAt }) => [id, updatedAt]),
      );
      const order = seen.map((id) => updatedAtById[id]!);
      expect(order).toEqual([...order].sort((a, b) => b - a));
    });

    it.each([["not-a-cursor"], ["eyJpZCI6ImEifQ"]])(
      "rejects the invalid cursor %s",
      async (cursor) => {
        const { workspace, users } = await seedWorkspaceWithRoles();

        await expectError(
          await call(`${productsPath(workspace.id)}?cursor=${cursor}`, {
            as: users.viewer,
          }),
          400,
          "VALIDATION",
        );
      },
    );

    it("rejects a limit above the maximum", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();

      await expectError(
        await call(`${productsPath(workspace.id)}?limit=101`, {
          as: users.viewer,
        }),
        400,
        "VALIDATION",
      );
    });
  });
});

describe("POST /api/w/:wid/products", () => {
  it("creates a product and answers 201 with the full DTO", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await create(workspace.id, users.editor, {
      ...validBody,
      description: "Envio gratis",
      utm: "utm_source=meta&utm_medium=paid",
      priceMinor: 10000,
      costMinor: 4000,
    });

    expect(response.status).toBe(201);
    const { product } = productResponseSchema.parse(await response.json());
    expect(Object.keys(product).sort()).toEqual(PRODUCT_KEYS);
    expect(product).toMatchObject({
      name: "Zapatillas",
      landingUrl: validBody.landingUrl,
      description: "Envio gratis",
      cta: "SHOP_NOW",
      utm: "utm_source=meta&utm_medium=paid",
      priceMinor: 10000,
      costMinor: 4000,
      currency: "USD",
      archived: false,
      landingStatus: "unchecked",
      breakEvenRoas: 1.67,
      profitPerSaleMinor: 6000,
    });
    const row = await rowOf(workspace.id, product.id);
    expect(row).toMatchObject({
      nameNormalized: "zapatillas",
      createdBy: users.editor.id,
    });
  });

  it("stores optional fields as null and has no break-even without a price", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await create(workspace.id, users.owner, validBody);

    const { product } = productResponseSchema.parse(await response.json());
    expect(product).toMatchObject({
      description: null,
      utm: null,
      priceMinor: null,
      costMinor: null,
      breakEvenRoas: null,
      profitPerSaleMinor: null,
    });
  });

  it("answers 409 NAME_TAKEN for the same name in any letter case", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    await create(workspace.id, users.editor, validBody);

    await expectError(
      await create(workspace.id, users.editor, {
        ...validBody,
        name: "  ZAPATILLAS ",
      }),
      409,
      "NAME_TAKEN",
    );
  });

  it("allows the same name in another workspace", async () => {
    const { A, B } = await seedTenantPair();
    await createProduct(B.workspace.id, { name: "Zapatillas" });

    const response = await create(A.workspace.id, A.users.owner, validBody);

    expect(response.status).toBe(201);
  });

  it.each([
    ["cost equal to price", { priceMinor: 5000, costMinor: 5000 }],
    ["cost above price", { priceMinor: 5000, costMinor: 9000 }],
  ])("answers 422 COST_NOT_BELOW_PRICE for %s", async (_label, amounts) => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await create(workspace.id, users.editor, { ...validBody, ...amounts }),
      422,
      "COST_NOT_BELOW_PRICE",
    );
    expect(
      await db
        .select()
        .from(products)
        .where(eq(products.workspaceId, workspace.id)),
    ).toEqual([]);
  });

  it.each([
    ["cost without price", { costMinor: 5000 }],
    ["zero cost", { priceMinor: 5000, costMinor: 0 }],
  ])("accepts %s", async (_label, amounts) => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await create(workspace.id, users.editor, {
      ...validBody,
      ...amounts,
    });

    expect(response.status).toBe(201);
  });

  it.each([
    ["http url", "http://tienda.example.test"],
    ["ftp url", "ftp://tienda.example.test"],
    ["not a url", "tienda.example.test"],
    ["https without slashes", "https:tienda.example.test"],
    ["empty host", "https://"],
  ])("answers 422 LANDING_NOT_HTTPS for %s", async (_label, landingUrl) => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await create(workspace.id, users.editor, { ...validBody, landingUrl }),
      422,
      "LANDING_NOT_HTTPS",
    );
  });

  it.each([
    ["missing name", { name: undefined }],
    ["blank name", { name: "   " }],
    ["long name", { name: "n".repeat(121) }],
    ["unknown cta", { cta: "CLICK_ME" }],
    ["lowercase currency", { currency: "usd" }],
    ["missing currency", { currency: undefined }],
    ["long headline", { headline: "h".repeat(256) }],
    ["utm with spaces", { utm: "utm source=meta" }],
    ["zero price", { priceMinor: 0 }],
    ["fractional price", { priceMinor: 10.5 }],
    ["negative cost", { costMinor: -1 }],
  ])("answers 400 VALIDATION for %s", async (_label, override) => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await create(workspace.id, users.editor, { ...validBody, ...override }),
      400,
      "VALIDATION",
    );
  });

  it("answers 403 to a viewer", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await create(workspace.id, users.viewer, validBody),
      403,
      "FORBIDDEN_ROLE",
    );
  });
});

describe("GET /api/w/:wid/products/:id", () => {
  it("returns the full DTO with computed profit and break-even", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, {
      priceMinor: 12000,
      costMinor: 9000,
    });

    const response = await call(productsPath(workspace.id, `/${product.id}`), {
      as: users.viewer,
    });

    expect(response.status).toBe(200);
    const body = productResponseSchema.parse(await response.json());
    expect(Object.keys(body.product).sort()).toEqual(PRODUCT_KEYS);
    expect(body.product).toMatchObject({
      id: product.id,
      breakEvenRoas: 4,
      profitPerSaleMinor: 3000,
    });
  });

  it("answers 404 for an unknown id", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(productsPath(workspace.id, `/${crypto.randomUUID()}`), {
        as: users.viewer,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("answers 404 for a product of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(productsPath(A.workspace.id, `/${B.product.id}`), {
        as: A.users.owner,
      }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("PATCH /api/w/:wid/products/:id", () => {
  it("updates only the given fields", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, {
      name: "Original",
      headline: "Titular",
      updatedAt: 1,
    });

    const response = await patch(workspace.id, product.id, users.editor, {
      headline: "Nuevo titular",
      cta: "BUY_NOW",
      priceMinor: 8000,
    });

    expect(response.status).toBe(200);
    const body = productResponseSchema.parse(await response.json());
    expect(body.product).toMatchObject({
      name: "Original",
      headline: "Nuevo titular",
      cta: "BUY_NOW",
      priceMinor: 8000,
      primaryText: product.primaryText,
    });
    expect(Date.parse(body.product.updatedAt)).toBeGreaterThan(1);
  });

  it("clears nullable fields with null", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, {
      description: "Algo",
      utm: "utm_source=x",
      priceMinor: 5000,
      costMinor: 1000,
    });

    const response = await patch(workspace.id, product.id, users.editor, {
      description: null,
      utm: null,
      priceMinor: null,
    });

    const { product: updated } = productResponseSchema.parse(
      await response.json(),
    );
    expect(updated).toMatchObject({
      description: null,
      utm: null,
      priceMinor: null,
      costMinor: 1000,
      breakEvenRoas: null,
    });
  });

  it("renames and refreshes the normalized name", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, { name: "Viejo" });

    await patch(workspace.id, product.id, users.editor, {
      name: "Nuevo Ñandú",
    });

    expect((await rowOf(workspace.id, product.id))?.nameNormalized).toBe(
      "nuevo ñandú",
    );
  });

  it("allows changing only the letter case of its own name", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, { name: "zapatillas" });

    const response = await patch(workspace.id, product.id, users.editor, {
      name: "Zapatillas",
    });

    expect(response.status).toBe(200);
  });

  it("answers 409 NAME_TAKEN when renaming onto another product in any letter case", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    await createProduct(workspace.id, { name: "Camisa" });
    const product = await createProduct(workspace.id, { name: "Pantalon" });

    await expectError(
      await patch(workspace.id, product.id, users.editor, { name: "cAMISA" }),
      409,
      "NAME_TAKEN",
    );
    expect((await rowOf(workspace.id, product.id))?.name).toBe("Pantalon");
  });

  it("answers 422 COST_NOT_BELOW_PRICE when the patched cost reaches the stored price", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, { priceMinor: 10000 });

    await expectError(
      await patch(workspace.id, product.id, users.editor, {
        costMinor: 10000,
      }),
      422,
      "COST_NOT_BELOW_PRICE",
    );
    expect((await rowOf(workspace.id, product.id))?.costMinor).toBeNull();
  });

  it("answers 422 COST_NOT_BELOW_PRICE when the patched price drops to the stored cost", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, {
      priceMinor: 10000,
      costMinor: 4000,
    });

    await expectError(
      await patch(workspace.id, product.id, users.editor, { priceMinor: 4000 }),
      422,
      "COST_NOT_BELOW_PRICE",
    );
    expect((await rowOf(workspace.id, product.id))?.priceMinor).toBe(10000);
  });

  it("accepts a patched price and cost that are valid together", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, {
      priceMinor: 10000,
      costMinor: 4000,
    });

    const response = await patch(workspace.id, product.id, users.editor, {
      priceMinor: 3000,
      costMinor: 1000,
    });

    expect(response.status).toBe(200);
  });

  it("resets the landing check when the url changes", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, {
      landingStatus: "ok",
      landingHttpStatus: 200,
      landingError: "old",
      landingCheckedAt: 123,
    });

    const response = await patch(workspace.id, product.id, users.editor, {
      landingUrl: "https://otra.example.test/pagina",
    });

    const body = productResponseSchema.parse(await response.json());
    expect(body.product).toMatchObject({
      landingUrl: "https://otra.example.test/pagina",
      landingStatus: "unchecked",
      landingHttpStatus: null,
      landingError: null,
      landingCheckedAt: null,
    });
  });

  it("keeps the landing check when the url stays the same", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, {
      landingStatus: "ok",
      landingHttpStatus: 200,
      landingCheckedAt: 123,
    });

    const response = await patch(workspace.id, product.id, users.editor, {
      landingUrl: product.landingUrl,
      headline: "Otro",
    });

    const body = productResponseSchema.parse(await response.json());
    expect(body.product.landingStatus).toBe("ok");
    expect(body.product.landingHttpStatus).toBe(200);
  });

  it("keeps the landing check when another field changes", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, { landingStatus: "ok" });

    const response = await patch(workspace.id, product.id, users.editor, {
      headline: "Otro",
    });

    const body = productResponseSchema.parse(await response.json());
    expect(body.product.landingStatus).toBe("ok");
  });

  it("answers 422 LANDING_NOT_HTTPS for a non https url", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id);

    await expectError(
      await patch(workspace.id, product.id, users.editor, {
        landingUrl: "http://inseguro.example.test",
      }),
      422,
      "LANDING_NOT_HTTPS",
    );
  });

  it.each([[{}], [{ cta: "NOPE" }], [{ name: "" }]])(
    "answers 400 VALIDATION for the body %j",
    async (body) => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      const product = await createProduct(workspace.id);

      await expectError(
        await patch(workspace.id, product.id, users.editor, body),
        400,
        "VALIDATION",
      );
    },
  );

  it("answers 404 for an unknown id", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await patch(workspace.id, crypto.randomUUID(), users.editor, {
        headline: "x",
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("answers 403 to a viewer and leaves the product untouched", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id);

    await expectError(
      await patch(workspace.id, product.id, users.viewer, { headline: "x" }),
      403,
      "FORBIDDEN_ROLE",
    );
    expect((await rowOf(workspace.id, product.id))?.headline).toBe(
      product.headline,
    );
  });

  it("does not touch a product of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await patch(A.workspace.id, B.product.id, A.users.owner, {
        headline: "Hijack",
      }),
      404,
      "NOT_FOUND",
    );
    expect((await rowOf(B.workspace.id, B.product.id))?.headline).toBe(
      B.product.headline,
    );
  });
});

describe("POST /api/w/:wid/products/:id/duplicate", () => {
  const duplicate = (workspaceId: string, id: string, as: Caller["as"]) =>
    call(productsPath(workspaceId, `/${id}/duplicate`), {
      as,
      method: "POST",
    });

  it("creates a copy named with the (copia) suffix", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const source = await createProduct(workspace.id, {
      name: "Zapatillas",
      description: "Desc",
      utm: "utm_source=x",
      priceMinor: 10000,
      costMinor: 4000,
      cta: "BUY_NOW",
      currency: "ARS",
      landingStatus: "ok",
      archived: 1,
    });

    const response = await duplicate(workspace.id, source.id, users.editor);

    expect(response.status).toBe(201);
    const { product } = productResponseSchema.parse(await response.json());
    expect(product.id).not.toBe(source.id);
    expect(product).toMatchObject({
      name: "Zapatillas (copia)",
      landingUrl: source.landingUrl,
      primaryText: source.primaryText,
      headline: source.headline,
      description: "Desc",
      utm: "utm_source=x",
      priceMinor: 10000,
      costMinor: 4000,
      cta: "BUY_NOW",
      currency: "ARS",
      archived: false,
      landingStatus: "unchecked",
    });
    const row = await rowOf(workspace.id, product.id);
    expect(row).toMatchObject({
      nameNormalized: "zapatillas (copia)",
      createdBy: users.editor.id,
    });
  });

  it("answers 409 NAME_TAKEN when the copy name already exists", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const source = await createProduct(workspace.id, { name: "Zapatillas" });
    await duplicate(workspace.id, source.id, users.editor);

    await expectError(
      await duplicate(workspace.id, source.id, users.editor),
      409,
      "NAME_TAKEN",
    );
  });

  it("answers 404 for an unknown id", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await duplicate(workspace.id, crypto.randomUUID(), users.editor),
      404,
      "NOT_FOUND",
    );
  });

  it("answers 403 to a viewer", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const source = await createProduct(workspace.id);

    await expectError(
      await duplicate(workspace.id, source.id, users.viewer),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("does not copy a product of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await duplicate(A.workspace.id, B.product.id, A.users.owner),
      404,
      "NOT_FOUND",
    );
    expect(
      await db
        .select()
        .from(products)
        .where(eq(products.workspaceId, A.workspace.id)),
    ).toHaveLength(1);
  });
});

describe("POST /api/w/:wid/products/:id/archive", () => {
  const archive = (
    workspaceId: string,
    id: string,
    as: Caller["as"],
    body: unknown,
  ) =>
    call(productsPath(workspaceId, `/${id}/archive`), {
      as,
      method: "POST",
      body,
    });

  it("archives and restores a product", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id);

    const archived = productResponseSchema.parse(
      await (
        await archive(workspace.id, product.id, users.editor, {
          archived: true,
        })
      ).json(),
    );
    const restored = productResponseSchema.parse(
      await (
        await archive(workspace.id, product.id, users.editor, {
          archived: false,
        })
      ).json(),
    );

    expect(archived.product.archived).toBe(true);
    expect(restored.product.archived).toBe(false);
    expect((await rowOf(workspace.id, product.id))?.archived).toBe(0);
  });

  it("moves the product out of the default list", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id);
    await archive(workspace.id, product.id, users.editor, { archived: true });

    const response = await call(productsPath(workspace.id), {
      as: users.viewer,
    });

    expect(productsPageSchema.parse(await response.json()).data).toEqual([]);
  });

  it.each([[{}], [{ archived: "yes" }], [undefined]])(
    "answers 400 VALIDATION for the body %j",
    async (body) => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      const product = await createProduct(workspace.id);

      await expectError(
        await archive(workspace.id, product.id, users.editor, body),
        400,
        "VALIDATION",
      );
    },
  );

  it("answers 404 for an unknown id", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await archive(workspace.id, crypto.randomUUID(), users.editor, {
        archived: true,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("answers 403 to a viewer", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id);

    await expectError(
      await archive(workspace.id, product.id, users.viewer, { archived: true }),
      403,
      "FORBIDDEN_ROLE",
    );
    expect((await rowOf(workspace.id, product.id))?.archived).toBe(0);
  });

  it("does not archive a product of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await archive(A.workspace.id, B.product.id, A.users.owner, {
        archived: true,
      }),
      404,
      "NOT_FOUND",
    );
    expect((await rowOf(B.workspace.id, B.product.id))?.archived).toBe(0);
  });
});

describe("workspace isolation of names", () => {
  it("does not count another workspace's product as a name clash on rename", async () => {
    const { workspace: other } = await createWorkspace();
    await createProduct(other.id, { name: "Camisa" });
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id, { name: "Pantalon" });

    const response = await patch(workspace.id, product.id, users.editor, {
      name: "Camisa",
    });

    expect(response.status).toBe(200);
  });
});
