import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { launchItems, launches } from "../../../src/db/schema/launches";
import { launchCheckSchema } from "../../../src/shared/schemas/launch";
import sessionFixture from "../../fixtures/meta/error-session.json";
import { expectError } from "../../helpers/factory";
import { metaFails } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import {
  call,
  db,
  fakeMeta,
  introspect,
  launchRow,
  type LaunchSetup,
  setup,
  startLaunch,
} from "../workflows/launch-fixture";
import { fakeVerify } from "../workflows/verify-fake";

const verify = (context: LaunchSetup, as = context.editor) =>
  call(context, "verify", { as });

const setStatus = (id: string, status: string) =>
  db.update(launches).set({ status }).where(eq(launches.id, id));

async function launched(itemCount = 2) {
  const context = await setup(itemCount);
  const meta = fakeMeta();
  await using instance = await introspect(context);
  await startLaunch(context, instance);
  await instance.waitForStatus("complete");
  return { context, meta };
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("POST /api/w/:wid/launches/:id/verify", () => {
  it("re-runs the checks and stores them", async () => {
    const { context } = await launched();
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "paused_verified",
      checksOk: 1,
    });

    const response = await verify(context);

    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      status: string;
      checksOk: boolean;
      checks: unknown[];
    };
    expect(body).toMatchObject({ status: "paused_verified", checksOk: true });
    const checks = body.checks.map((check) => launchCheckSchema.parse(check));
    expect(checks.every(({ ok }) => ok)).toBe(true);
    const row = await launchRow(context.launch.id);
    expect(JSON.parse(row.checks!)).toEqual(checks);
  });

  it("marks verified_with_errors when an Advantage+ feature is OPT_IN", async () => {
    const { context, meta } = await launched(1);
    server.use(
      ...fakeVerify(meta, (path, body) =>
        path.endsWith("/ads")
          ? {
              data: (body.data as { creative: object }[]).map((ad) => ({
                ...ad,
                creative: {
                  ...ad.creative,
                  degrees_of_freedom_spec: {
                    creative_features_spec: {
                      image_touchups: { enroll_status: "OPT_IN" },
                    },
                  },
                },
              })),
            }
          : body,
      ),
    );

    const response = await verify(context);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      status: "verified_with_errors",
      checksOk: false,
      checks: expect.arrayContaining([
        expect.objectContaining({ code: "ENHANCEMENTS_OFF", ok: false }),
      ]),
    });
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "verified_with_errors",
      checksOk: 0,
    });
  });

  it("fails AD_COUNT when an item failed and its ad is missing", async () => {
    const { context, meta } = await launched(2);
    const [failed] = await db
      .select({ id: launchItems.id })
      .from(launchItems)
      .where(eq(launchItems.launchId, context.launch.id))
      .limit(1);
    await db
      .update(launchItems)
      .set({ status: "failed" })
      .where(eq(launchItems.id, failed!.id));
    server.use(
      ...fakeVerify(meta, (path, body) =>
        path.endsWith("/ads")
          ? { data: (body.data as object[]).slice(1) }
          : body,
      ),
    );

    const response = await verify(context);

    expect(await response.json()).toMatchObject({
      checks: expect.arrayContaining([
        expect.objectContaining({ code: "AD_COUNT", ok: false }),
      ]),
    });
  });

  it("returns 409 LAUNCH_RUNNING while the launch runs", async () => {
    const context = await setup(1);
    await setStatus(context.launch.id, "running");

    await expectError(await verify(context), 409, "LAUNCH_RUNNING");
  });

  it("returns 409 NOT_PAUSED for a launch that never ran", async () => {
    const context = await setup(1);

    await expectError(await verify(context), 409, "NOT_PAUSED");
  });

  it("returns 409 META_RECONNECT_REQUIRED when the token was revoked", async () => {
    const { context } = await launched(1);
    server.use(metaFails("", sessionFixture, 401));

    await expectError(await verify(context), 409, "META_RECONNECT_REQUIRED");
    expect((await launchRow(context.launch.id)).status).toBe("paused_verified");
  });

  it("returns 403 for a viewer", async () => {
    const context = await setup(1);

    await expectError(
      await verify(context, context.viewer),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 401 without a session", async () => {
    const context = await setup(1);

    expect((await call(context, "verify", { as: undefined })).status).toBe(401);
  });
});
