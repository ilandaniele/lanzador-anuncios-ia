import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { products } from "../../src/db/schema/products";
import { checkLandingResponseSchema } from "../../src/shared/schemas/products";
import { api, createProduct, expectError } from "../helpers/factory";
import { landingResponds } from "../helpers/msw/landing";
import { server } from "../helpers/msw/server";
import { seedTenantPair, seedWorkspaceWithRoles } from "../helpers/tenant-pair";
import { blockedLimiter, openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const LANDING = "https://tienda.example.test/producto";
const openLimits = {
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_EXP: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

const checkLanding = (
  workspaceId: string,
  id: string,
  as?: Caller["as"],
  limits: Caller["env"] = openLimits,
) =>
  api(app, `/api/w/${workspaceId}/products/${id}/check-landing`, {
    as,
    method: "POST",
    env: limits,
  });

const rowOf = (workspaceId: string, id: string) =>
  db
    .select()
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), eq(products.id, id)))
    .then(([row]) => row!);

async function seedProduct(overrides: Partial<typeof products.$inferInsert>) {
  const { workspace, users } = await seedWorkspaceWithRoles();
  const product = await createProduct(workspace.id, overrides);
  return { workspace, users, product };
}

describe("POST /api/w/:wid/products/:id/check-landing", () => {
  it("returns 401 without a session", async () => {
    const { workspace, product } = await seedProduct({});

    await expectError(
      await checkLanding(workspace.id, product.id),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("returns 403 for a viewer", async () => {
    const { workspace, users, product } = await seedProduct({});

    await expectError(
      await checkLanding(workspace.id, product.id, users.viewer),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 404 for an unknown id", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await checkLanding(workspace.id, crypto.randomUUID(), users.editor),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for another workspace's product and leaves it untouched", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await checkLanding(A.workspace.id, B.product.id, A.users.owner),
      404,
      "NOT_FOUND",
    );

    expect((await rowOf(B.workspace.id, B.product.id)).landingStatus).toBe(
      "unchecked",
    );
  });

  it("returns 429 when the EXP limiter blocks", async () => {
    const { workspace, users, product } = await seedProduct({});

    const response = await checkLanding(
      workspace.id,
      product.id,
      users.editor,
      {
        ...openLimits,
        RL_EXP: blockedLimiter,
      },
    );

    await expectError(response, 429, "RATE_LIMITED");
  });

  it("returns the exact result shape and persists ok", async () => {
    server.use(landingResponds(LANDING, 200));
    const { workspace, users, product } = await seedProduct({
      landingUrl: LANDING,
    });
    const before = Date.now();

    const response = await checkLanding(workspace.id, product.id, users.editor);

    expect(response.status).toBe(200);
    const body = checkLandingResponseSchema.parse(await response.json());
    expect(Object.keys(body).sort()).toEqual([
      "finalUrl",
      "httpStatus",
      "ms",
      "status",
    ]);
    expect(body).toMatchObject({
      status: "ok",
      httpStatus: 200,
      finalUrl: LANDING,
    });
    const row = await rowOf(workspace.id, product.id);
    expect(row).toMatchObject({
      landingStatus: "ok",
      landingHttpStatus: 200,
      landingError: null,
    });
    expect(row.landingCheckedAt).toBeGreaterThanOrEqual(before);
    expect(row.updatedAt).toBe(product.updatedAt);
  });

  it("follows redirects and persists soft_ok for 403", async () => {
    server.use(
      landingResponds(LANDING, 301, "/destino"),
      landingResponds("https://tienda.example.test/destino", 403),
    );
    const { workspace, users, product } = await seedProduct({
      landingUrl: LANDING,
    });

    const response = await checkLanding(workspace.id, product.id, users.admin);

    expect(await response.json()).toMatchObject({
      status: "soft_ok",
      httpStatus: 403,
      finalUrl: "https://tienda.example.test/destino",
    });
    expect(await rowOf(workspace.id, product.id)).toMatchObject({
      landingStatus: "soft_ok",
      landingHttpStatus: 403,
      landingError: null,
    });
  });

  it("persists error with http status and code on 500", async () => {
    server.use(landingResponds(LANDING, 500));
    const { workspace, users, product } = await seedProduct({
      landingUrl: LANDING,
    });

    const response = await checkLanding(workspace.id, product.id, users.editor);

    expect(await response.json()).toMatchObject({
      status: "error",
      httpStatus: 500,
      error: "http_500",
    });
    expect(await rowOf(workspace.id, product.id)).toMatchObject({
      landingStatus: "error",
      landingHttpStatus: 500,
      landingError: "http_500",
    });
  });

  it("blocks a redirect to an internal address and clears the old http status", async () => {
    server.use(landingResponds(LANDING, 302, "https://127.0.0.1/admin"));
    const { workspace, users, product } = await seedProduct({
      landingUrl: LANDING,
      landingStatus: "ok",
      landingHttpStatus: 200,
    });

    const response = await checkLanding(workspace.id, product.id, users.editor);

    expect(await response.json()).toMatchObject({
      status: "error",
      httpStatus: null,
      error: "ip_literal",
    });
    expect(await rowOf(workspace.id, product.id)).toMatchObject({
      landingStatus: "error",
      landingHttpStatus: null,
      landingError: "ip_literal",
    });
  });

  it("reports a network failure as a stable code", async () => {
    server.use(http.get(LANDING, () => HttpResponse.error()));
    const { workspace, users, product } = await seedProduct({
      landingUrl: LANDING,
    });

    const response = await checkLanding(workspace.id, product.id, users.editor);

    expect(await response.json()).toMatchObject({
      status: "error",
      error: "network",
    });
  });

  it("checks archived products too", async () => {
    server.use(landingResponds(LANDING, 200));
    const { workspace, users, product } = await seedProduct({
      landingUrl: LANDING,
      archived: 1,
    });

    const response = await checkLanding(workspace.id, product.id, users.editor);

    expect(response.status).toBe(200);
    expect((await rowOf(workspace.id, product.id)).landingStatus).toBe("ok");
  });

  it("does not store a result for a url changed during the check", async () => {
    const { workspace, users, product } = await seedProduct({
      landingUrl: LANDING,
    });
    server.use(
      http.get(LANDING, async () => {
        await db
          .update(products)
          .set({ landingUrl: "https://otra.example.test/" })
          .where(eq(products.id, product.id));
        await delay(0);
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await checkLanding(workspace.id, product.id, users.editor);

    expect((await rowOf(workspace.id, product.id)).landingStatus).toBe(
      "unchecked",
    );
  });
});
