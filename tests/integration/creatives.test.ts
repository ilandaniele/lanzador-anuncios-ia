import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { creatives } from "../../src/db/schema/creatives";
import { launchItems } from "../../src/db/schema/launches";
import {
  creativeResponseSchema,
  creativesPageSchema,
} from "../../src/shared/schemas/creatives";
import {
  api,
  createCreative,
  createLaunch,
  createMetaAsset,
  createMetaConnection,
  createUser,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import { openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

const routeEnv = { RL_IP: openLimiter, RL_USER: openLimiter };

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { ...options, env: { ...routeEnv, ...options.env } });

async function setup() {
  const viewer = await createUser();
  const { workspace, owner } = await createWorkspace({
    members: [{ user: viewer, role: "viewer" }],
  });
  const connection = await createMetaConnection(
    keyEnv,
    workspace.id,
    "EAABcreativesToken",
  );
  const asset = await createMetaAsset(workspace.id, connection.id);
  return { wid: workspace.id, owner, viewer, asset };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const creativesPath = (wid: string, query = "") =>
  `/api/w/${wid}/creatives${query ? `?${query}` : ""}`;
const creativePath = (wid: string, id: string, action = "") =>
  `/api/w/${wid}/creatives/${id}${action ? `/${action}` : ""}`;

async function listIds({ wid, viewer }: Setup, query = "") {
  const response = await call(creativesPath(wid, query), { as: viewer });
  expect(response.status).toBe(200);
  return creativesPageSchema.parse(await response.json());
}

const idsOf = (page: { data: { id: string }[] }) =>
  page.data.map((creative) => creative.id);

let clock = Date.now();
const nextAt = () => (clock += 1000);

const seedCreative = (
  { wid, asset }: Setup,
  overrides: Parameters<typeof createCreative>[2] = {},
) => createCreative(wid, asset.id, { createdAt: nextAt(), ...overrides });

async function useInLaunches(
  wid: string,
  creativeId: string,
  launches: number,
) {
  for (let count = 0; count < launches; count += 1) {
    const launch = await createLaunch(wid);
    const at = Date.now();
    await db.insert(launchItems).values(
      [0, 1].map((position) => ({
        id: crypto.randomUUID(),
        workspaceId: wid,
        launchId: launch.id,
        position,
        source: "upload",
        creativeId,
        adName: `ad-${position}`,
        createdAt: at,
        updatedAt: at,
      })),
    );
  }
}

function countingDb() {
  const counter = { statements: 0 };
  const DB = new Proxy(env.DB, {
    get(target, key) {
      if (key === "prepare") counter.statements += 1;
      const value = Reflect.get(target, key) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { DB, counter };
}

describe("GET /api/w/:wid/creatives", () => {
  it("lists library creatives newest first as DTOs", async () => {
    const ctx = await setup();
    const older = await seedCreative(ctx, { adName: "Viejo" });
    const newer = await seedCreative(ctx, {
      kind: "video",
      contentType: "video/mp4",
      metaImageHash: null,
      metaVideoId: "vid_1",
      status: "processing",
      formatWarning: "horizontal",
      tagHook: "Pregunta",
      tagOnScreenText: 1,
    });
    await seedCreative(ctx, { status: "uploading" });
    await seedCreative(ctx, { status: "archived" });
    await seedCreative(ctx, { status: "failed", error: "meta" });

    const page = await listIds(ctx);

    expect(idsOf(page)).toEqual([newer.id, older.id]);
    expect(page.data[0]).toEqual({
      id: newer.id,
      name: newer.originalFilename,
      kind: "video",
      status: "processing",
      adAccountAssetId: ctx.asset.id,
      thumbnailUrl: null,
      formatWarning: "horizontal",
      tags: {
        hook: "Pregunta",
        angle: null,
        format: null,
        language: null,
        onScreenText: true,
      },
      aiStatus: "pending",
      usedInLaunches: 0,
      createdAt: new Date(newer.createdAt).toISOString(),
    });
    expect(page.data[1]?.name).toBe("Viejo");
    expect(JSON.stringify(page)).not.toMatch(/sha256|metaImageHash|hash_/);
  });

  it("filters by status, kind and q", async () => {
    const ctx = await setup();
    const failed = await seedCreative(ctx, {
      status: "failed",
      originalFilename: "verano_100%.png",
    });
    const archived = await seedCreative(ctx, { status: "archived" });
    const video = await seedCreative(ctx, {
      kind: "video",
      contentType: "video/mp4",
      metaImageHash: null,
      adName: "Verano UGC",
    });
    const image = await seedCreative(ctx, { originalFilename: "otoño.png" });

    expect(idsOf(await listIds(ctx, "status=failed,archived"))).toEqual([
      archived.id,
      failed.id,
    ]);
    expect(idsOf(await listIds(ctx, "kind=video"))).toEqual([video.id]);
    expect(idsOf(await listIds(ctx, "kind=image"))).toEqual([image.id]);
    expect(idsOf(await listIds(ctx, "q=verano"))).toEqual([video.id]);
    expect(idsOf(await listIds(ctx, "q=100%25&status=failed"))).toEqual([
      failed.id,
    ]);
    expect(idsOf(await listIds(ctx, "q=_100"))).toEqual([]);
  });

  it("filters by tag, ad account and ids", async () => {
    const ctx = await setup();
    const tagged = await seedCreative(ctx, { tagAngle: "precio" });
    const failed = await seedCreative(ctx, { status: "failed" });
    const plain = await seedCreative(ctx);
    const connection = await createMetaConnection(keyEnv, ctx.wid, "EAABother");
    const otherAsset = await createMetaAsset(ctx.wid, connection.id);
    const elsewhere = await createCreative(ctx.wid, otherAsset.id, {
      createdAt: nextAt(),
    });

    expect(idsOf(await listIds(ctx, "tag=precio"))).toEqual([tagged.id]);
    expect(
      idsOf(await listIds(ctx, `adAccountAssetId=${otherAsset.id}`)),
    ).toEqual([elsewhere.id]);
    expect(idsOf(await listIds(ctx, `ids=${plain.id},${failed.id}`))).toEqual([
      plain.id,
      failed.id,
    ]);
  });

  it("never lists creatives of another workspace", async () => {
    const ctx = await setup();
    const other = await setup();
    const foreign = await seedCreative(other);

    expect(idsOf(await listIds(ctx, `ids=${foreign.id}`))).toEqual([]);
    expect(idsOf(await listIds(ctx))).toEqual([]);
  });

  it("pages with a cursor", async () => {
    const ctx = await setup();
    const [first, second, third] = [
      await seedCreative(ctx),
      await seedCreative(ctx),
      await seedCreative(ctx),
    ];

    const pageOne = await listIds(ctx, "limit=2");
    expect(idsOf(pageOne)).toEqual([third!.id, second!.id]);
    const pageTwo = await listIds(
      ctx,
      `limit=2&cursor=${encodeURIComponent(pageOne.nextCursor!)}`,
    );
    expect(idsOf(pageTwo)).toEqual([first!.id]);
    expect(pageTwo.nextCursor).toBeNull();
  });

  it("sorts by distinct launches with sort=most_used and pages it", async () => {
    const ctx = await setup();
    const once = await seedCreative(ctx);
    const never = await seedCreative(ctx);
    const thrice = await seedCreative(ctx);
    const twice = await seedCreative(ctx);
    await useInLaunches(ctx.wid, once.id, 1);
    await useInLaunches(ctx.wid, thrice.id, 3);
    await useInLaunches(ctx.wid, twice.id, 2);

    const pageOne = await listIds(ctx, "sort=most_used&limit=2");
    expect(idsOf(pageOne)).toEqual([thrice.id, twice.id]);
    expect(pageOne.data.map((creative) => creative.usedInLaunches)).toEqual([
      3, 2,
    ]);
    const pageTwo = await listIds(
      ctx,
      `sort=most_used&limit=2&cursor=${encodeURIComponent(pageOne.nextCursor!)}`,
    );
    expect(idsOf(pageTwo)).toEqual([once.id, never.id]);
  });

  it("runs the most_used list in the same number of queries as the plain list", async () => {
    const ctx = await setup();
    for (let index = 0; index < 3; index += 1) {
      const creative = await seedCreative(ctx);
      await useInLaunches(ctx.wid, creative.id, index + 1);
    }
    const count = async (query: string) => {
      const { DB, counter } = countingDb();
      const response = await call(creativesPath(ctx.wid, query), {
        as: ctx.viewer,
        env: { DB },
      });
      expect(response.status).toBe(200);
      return counter.statements;
    };

    expect(await count("sort=most_used")).toBe(await count("sort=recent"));
    expect(await count("sort=most_used&limit=1")).toBe(
      await count("sort=most_used"),
    );
  });

  it("returns 400 for unknown filters values", async () => {
    const ctx = await setup();

    for (const query of ["status=deleted", "kind=gif", "sort=oldest"]) {
      await expectError(
        await call(creativesPath(ctx.wid, query), { as: ctx.viewer }),
        400,
        "VALIDATION",
      );
    }
  });
});

describe("GET /api/w/:wid/creatives/:id", () => {
  it("returns one creative with its launch count", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);
    await useInLaunches(ctx.wid, creative.id, 2);

    const response = await call(creativePath(ctx.wid, creative.id), {
      as: ctx.viewer,
    });

    expect(
      creativeResponseSchema.parse(await response.json()).creative,
    ).toMatchObject({ id: creative.id, usedInLaunches: 2 });
  });

  it("returns 404 for a creative of another workspace", async () => {
    const ctx = await setup();
    const foreign = await seedCreative(await setup());

    await expectError(
      await call(creativePath(ctx.wid, foreign.id), { as: ctx.viewer }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("PATCH /api/w/:wid/creatives/:id", () => {
  it("renames and edits tags, marking them as edited", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);
    const tags = {
      hook: "Antes y después",
      angle: "precio",
      format: "ugc",
      language: "es",
      onScreenText: false,
    };

    const response = await call(creativePath(ctx.wid, creative.id), {
      as: ctx.owner,
      method: "PATCH",
      body: { name: "  Anuncio verano  ", tags },
    });

    expect(
      creativeResponseSchema.parse(await response.json()).creative,
    ).toMatchObject({ name: "Anuncio verano", tags });
    const [row] = await db
      .select()
      .from(creatives)
      .where(eq(creatives.id, creative.id));
    expect(row).toMatchObject({
      adName: "Anuncio verano",
      tagFormat: "ugc",
      tagOnScreenText: 0,
      tagsEdited: 1,
    });
  });

  it("returns 400 for an empty patch or an invalid tag", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);
    const tags = {
      hook: null,
      angle: null,
      format: "meme",
      language: null,
      onScreenText: null,
    };

    for (const body of [{}, { tags }, { name: "" }]) {
      await expectError(
        await call(creativePath(ctx.wid, creative.id), {
          as: ctx.owner,
          method: "PATCH",
          body,
        }),
        400,
        "VALIDATION",
      );
    }
  });

  it("returns 404 and leaves a foreign creative untouched", async () => {
    const ctx = await setup();
    const foreign = await seedCreative(await setup());

    await expectError(
      await call(creativePath(ctx.wid, foreign.id), {
        as: ctx.owner,
        method: "PATCH",
        body: { name: "Hijack" },
      }),
      404,
      "NOT_FOUND",
    );
    const [row] = await db
      .select()
      .from(creatives)
      .where(eq(creatives.id, foreign.id));
    expect(row?.adName).toBeNull();
  });
});

describe("POST /api/w/:wid/creatives/:id/archive", () => {
  const archive = (ctx: Setup, id: string, archived: boolean) =>
    call(creativePath(ctx.wid, id, "archive"), {
      as: ctx.owner,
      method: "POST",
      body: { archived },
    });

  const statusOf = async (response: Response) =>
    creativeResponseSchema.parse(await response.json()).creative.status;

  it("archives a ready creative and restores it", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);

    expect(await statusOf(await archive(ctx, creative.id, true))).toBe(
      "archived",
    );
    expect(await statusOf(await archive(ctx, creative.id, false))).toBe(
      "ready",
    );
  });

  it("restores a failed creative as failed", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, {
      status: "failed",
      error: "meta",
    });

    await archive(ctx, creative.id, true);

    expect(await statusOf(await archive(ctx, creative.id, false))).toBe(
      "failed",
    );
  });

  it("returns 409 CREATIVE_NOT_READY while processing", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { status: "processing" });

    await expectError(
      await archive(ctx, creative.id, true),
      409,
      "CREATIVE_NOT_READY",
    );
  });

  it("returns 404 for a creative of another workspace", async () => {
    const ctx = await setup();
    const foreign = await seedCreative(await setup());

    await expectError(await archive(ctx, foreign.id, true), 404, "NOT_FOUND");
  });
});
