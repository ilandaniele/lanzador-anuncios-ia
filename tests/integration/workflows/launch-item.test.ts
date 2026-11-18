import { introspectWorkflow } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { creatives } from "../../../src/db/schema/creatives";
import { createMetaAsset } from "../../helpers/factory";
import { graphUrl } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import {
  ACCOUNT_META_ID,
  db,
  fakeMeta,
  introspect,
  itemRows,
  launchRow,
  setup,
  startLaunch,
} from "./launch-fixture";

const VIDEO_ID = "video_123";
const THUMBNAIL_URL = "https://scontent.example.com/thumb.jpg";
const creativesPath = graphUrl(`${ACCOUNT_META_ID}/adcreatives`);

const metaErrorOnce = (code: number, extra: Record<string, string> = {}) =>
  server.use(
    http.post(
      creativesPath,
      () =>
        HttpResponse.json(
          { error: { message: "Meta error", code, ...extra } },
          { status: 400 },
        ),
      { once: true },
    ),
  );

function recordRequests() {
  const urls: string[] = [];
  server.events.on("request:start", ({ request }) => {
    urls.push(request.url);
  });
  return urls;
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("LaunchItemWorkflow", () => {
  it("reuses meta_video_id and the stored thumbnail without uploading", async () => {
    const context = await setup(1, {
      kind: "video",
      contentType: "video/mp4",
      metaImageHash: null,
      metaVideoId: VIDEO_ID,
      thumbnailUrl: THUMBNAIL_URL,
    });
    const meta = fakeMeta();
    const urls = recordRequests();
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    expect(urls.some((url) => /\/(advideos|adimages)\b/.test(url))).toBe(false);
    expect(meta.adcreatives).toHaveLength(1);
    const spec = JSON.parse(meta.adcreatives[0]!.get("object_story_spec")!);
    expect(spec.video_data).toMatchObject({
      video_id: VIDEO_ID,
      image_url: THUMBNAIL_URL,
    });
    expect(meta.ads[0]!.get("status")).toBe("PAUSED");
    const [item] = await itemRows(context.launch.id);
    expect(item).toMatchObject({
      status: "done",
      metaCreativeId: "adcreatives-1",
      metaAdId: "ads-1",
    });
  });

  it("fails an item whose creative belongs to another ad account", async () => {
    const context = await setup(2);
    const other = await createMetaAsset(context.wid, context.connection.id, {
      metaId: "act_777",
    });
    const meta = fakeMeta();
    server.use(
      http.post(graphUrl(`${ACCOUNT_META_ID}/adsets`), async () => {
        await db
          .update(creatives)
          .set({ adAccountAssetId: other.id })
          .where(eq(creatives.id, context.images[0]!.id));
      }),
    );
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    const [moved, kept] = await itemRows(context.launch.id);
    expect(moved).toMatchObject({
      status: "failed",
      errorCode: "MEDIA_NOT_IN_ACCOUNT",
      errorMessage: "Volvé a subirlo para esta cuenta",
      metaCreativeId: null,
    });
    expect(kept).toMatchObject({ status: "done" });
    expect(meta.adcreatives).toHaveLength(1);
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "verified_with_errors",
      itemsDone: 1,
      itemsFailed: 1,
    });
  });

  it("fails the item with error_user_msg on Meta error 100 and keeps going", async () => {
    const context = await setup(2);
    fakeMeta();
    metaErrorOnce(100, {
      error_user_title: "Creativo rechazado",
      error_user_msg: "La imagen no cumple las políticas",
    });
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    const items = await itemRows(context.launch.id);
    expect(items.filter(({ status }) => status === "done")).toHaveLength(1);
    expect(items.find(({ status }) => status === "failed")).toMatchObject({
      errorCode: "META_ERROR",
      errorMessage: "Creativo rechazado: La imagen no cumple las políticas",
      metaAdId: null,
    });
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "verified_with_errors",
      itemsDone: 1,
      itemsFailed: 1,
    });
  });

  it("waits on Meta error 17 and then creates the item", async () => {
    const context = await setup(1);
    const meta = fakeMeta();
    metaErrorOnce(17);
    await using items = await introspectWorkflow(env.LAUNCH_ITEM_WF);
    await items.modifyAll(async (m) => {
      await m.disableSleeps();
    });
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    const [item] = await itemRows(context.launch.id);
    const [child] = await items.get();
    expect(
      await child!.waitForStepResult({
        name: `creative ${item!.id} (retry 1)`,
      }),
    ).toEqual({ ok: true, value: "adcreatives-1" });
    expect(meta.adcreatives).toHaveLength(1);
    expect(item).toMatchObject({ status: "done", metaAdId: "ads-1" });
  });
});
