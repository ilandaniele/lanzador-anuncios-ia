import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/api/app";
import type { Env } from "../../../src/api/env";
import { creatives } from "../../../src/db/schema/creatives";
import { aiUsage } from "../../../src/db/schema/ops";
import {
  retagResponseSchema,
  tagResponseSchema,
} from "../../../src/shared/schemas/creatives";
import type { JobContext } from "../../../src/workflows/jobs/job-context";
import { tagCreativeJob } from "../../../src/workflows/jobs/tag-creative";
import {
  api,
  createCreative,
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
  expectError,
  loginAs,
} from "../../helpers/factory";
import { FakeAiProvider } from "../../helpers/fake-ai-provider";
import { server } from "../../helpers/msw/server";
import { openLimiter, testEnv, trustedHeaders } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);

const THUMBNAIL_URL = "https://scontent-gru1-1.xx.fbcdn.net/v/t/thumb.jpg";
const THUMBNAIL_BYTES = Uint8Array.from([1, 2, 3, 4]);
const SHEET_BYTES = Uint8Array.from([255, 216, 255, 224, 9, 9, 9]);
const KIB = 1024;

const openLimits = {
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_EXP: openLimiter,
};

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

const tagsReply = (overrides: Record<string, unknown> = {}) => ({
  text: JSON.stringify({
    hook: "Dolor de espalda",
    angle: "Prueba social",
    format: "ugc",
    language: "ES",
    onScreenText: true,
    summary: "Una persona muestra el producto",
    ...overrides,
  }),
});

const noBudget = { WORKERS_AI_DAILY_NEURON_CAP: 0 };

async function setup() {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, "EAAB");
  const asset = await createMetaAsset(workspace.id, connection.id);
  return { workspace, owner, asset };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const seedCreative = (
  { workspace, asset }: Setup,
  overrides: Parameters<typeof createCreative>[2] = {},
) =>
  createCreative(workspace.id, asset.id, {
    thumbnailUrl: THUMBNAIL_URL,
    ...overrides,
  });

const creativePath = (workspaceId: string, id: string, action: string) =>
  `/api/w/${workspaceId}/creatives/${id}/${action}`;

async function postSheet(
  { workspace, owner }: Setup,
  creativeId: string,
  provider: FakeAiProvider,
  {
    bytes = SHEET_BYTES,
    contentType = "image/jpeg",
    env: envOverrides = {},
  }: { bytes?: Uint8Array; contentType?: string; env?: Partial<Env> } = {},
) {
  const { cookie } = await loginAs(owner);
  return app.request(
    creativePath(workspace.id, creativeId, "tag"),
    {
      method: "POST",
      headers: {
        ...trustedHeaders,
        Cookie: cookie,
        "Content-Type": contentType,
      },
      body: bytes,
    },
    testEnv({ ...openLimits, AI_PROVIDER: provider, ...envOverrides }),
  );
}

const fakeJobs = () => {
  const create = vi.fn<(options: unknown) => Promise<object>>(async () => ({}));
  return { create, binding: { create } as unknown as Workflow };
};

const postRetag = (
  { workspace, owner }: Setup,
  creativeId: string,
  jobs = fakeJobs(),
  envOverrides: Partial<Env> = {},
) =>
  api(app, creativePath(workspace.id, creativeId, "retag"), {
    as: owner,
    method: "POST",
    env: { ...openLimits, JOB_WF: jobs.binding, ...envOverrides },
  });

const inlineStep = {
  do: (_name: string, _config: unknown, run: () => Promise<unknown>) => run(),
} as unknown as JobContext["step"];

const runJob = (
  { workspace }: Setup,
  payload: JobContext["payload"],
  provider: FakeAiProvider,
  envOverrides: Partial<Env> = {},
) =>
  tagCreativeJob({
    env: testEnv({ AI_PROVIDER: provider, ...envOverrides }),
    step: inlineStep,
    key: "job",
    workspaceId: workspace.id,
    payload,
  });

const readCreative = async (id: string) =>
  (await db.select().from(creatives).where(eq(creatives.id, id)))[0]!;

const usageFor = (workspaceId: string) =>
  db
    .select()
    .from(aiUsage)
    .where(
      and(eq(aiUsage.workspaceId, workspaceId), eq(aiUsage.feature, "tagging")),
    );

const serveThumbnail = (url = THUMBNAIL_URL) => {
  const requested = vi.fn();
  server.use(
    http.get(url, () => {
      requested();
      return new HttpResponse(THUMBNAIL_BYTES, {
        headers: { "Content-Type": "image/jpeg" },
      });
    }),
  );
  return requested;
};

describe("POST /creatives/:id/tag", () => {
  it("stores the tags and a suggested ad name from the template", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { status: "uploading" });
    const provider = new FakeAiProvider({ describeImage: [tagsReply()] });

    const response = await postSheet(ctx, creative.id, provider);

    expect(response.status).toBe(200);
    expect(tagResponseSchema.parse(await response.json())).toEqual({
      tags: {
        hook: "Dolor de espalda",
        angle: "Prueba social",
        format: "ugc",
        language: "es",
        onScreenText: true,
      },
    });
    expect(await readCreative(creative.id)).toMatchObject({
      aiStatus: "done",
      aiModel: "fake-model",
      tagHook: "Dolor de espalda",
      tagLanguage: "es",
      tagOnScreenText: 1,
      tagSummary: "Una persona muestra el producto",
      tagsEdited: 0,
      adNameSuggested: "dolor-de-espalda-ugc-prueba-social-1",
    });
  });

  it("numbers the suggested ad name after the workspace creatives", async () => {
    const ctx = await setup();
    const at = Date.now();
    await seedCreative(ctx, { createdAt: at - 2000 });
    const second = await seedCreative(ctx, { createdAt: at - 1000 });

    await postSheet(
      ctx,
      second.id,
      new FakeAiProvider({ describeImage: [tagsReply()] }),
    );

    expect((await readCreative(second.id)).adNameSuggested).toMatch(/-2$/);
  });

  it("sends the contact sheet to the vision model without persisting it", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);
    const provider = new FakeAiProvider({ describeImage: [tagsReply()] });

    await postSheet(ctx, creative.id, provider);

    const [call] = provider.callsTo("describeImage");
    expect(call!.input).toMatchObject({
      json: true,
      image: { bytes: SHEET_BYTES, mimeType: "image/jpeg" },
      prompt: expect.stringContaining(creative.originalFilename),
    });
    const stored = JSON.stringify(await readCreative(creative.id));
    expect(stored).not.toContain(btoa(String.fromCharCode(...SHEET_BYTES)));
    expect(stored).not.toContain("image/jpeg");
  });

  it("records the usage under the tagging feature", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);

    await postSheet(
      ctx,
      creative.id,
      new FakeAiProvider({ describeImage: [tagsReply()] }),
    );

    expect(await usageFor(ctx.workspace.id)).toMatchObject([
      { userId: ctx.owner.id, refId: creative.id, neurons: 1 },
    ]);
  });

  it("accepts a contact sheet above the 16 KB JSON limit", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);
    const provider = new FakeAiProvider({ describeImage: [tagsReply()] });

    const response = await postSheet(ctx, creative.id, provider, {
      bytes: new Uint8Array(512 * KIB),
    });

    expect(response.status).toBe(200);
  });

  it("answers 413 above 1 MiB without calling the model", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);
    const provider = new FakeAiProvider();

    const response = await postSheet(ctx, creative.id, provider, {
      bytes: new Uint8Array(KIB * KIB + 1),
    });

    await expectError(response, 413, "PAYLOAD_TOO_LARGE");
    expect(provider.calls).toEqual([]);
  });

  it("answers 415 for a body that is not image/jpeg", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);
    const provider = new FakeAiProvider();

    const response = await postSheet(ctx, creative.id, provider, {
      contentType: "image/png",
    });

    await expectError(response, 415, "UNSUPPORTED_TYPE");
    expect(provider.calls).toEqual([]);
  });

  it("answers 422 and leaves ai_status pending without budget", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { aiStatus: "queued" });
    const provider = new FakeAiProvider();

    const response = await postSheet(ctx, creative.id, provider, {
      env: noBudget,
    });

    await expectError(response, 422, "AI_BUDGET_EXHAUSTED");
    expect(provider.calls).toEqual([]);
    expect((await readCreative(creative.id)).aiStatus).toBe("pending");
  });

  it("answers 502 and marks ai_status failed for an invalid model reply", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);
    const provider = new FakeAiProvider({
      describeImage: [tagsReply({ format: "meme" })],
    });

    const response = await postSheet(ctx, creative.id, provider);

    await expectError(response, 502, "AI_UPSTREAM");
    expect(await readCreative(creative.id)).toMatchObject({
      aiStatus: "failed",
      tagHook: null,
    });
  });

  it("keeps the tags the user edited", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, {
      tagsEdited: 1,
      tagHook: "Mi gancho",
      tagFormat: "demo",
      tagOnScreenText: 0,
    });
    const provider = new FakeAiProvider({ describeImage: [tagsReply()] });

    const response = await postSheet(ctx, creative.id, provider);

    expect(tagResponseSchema.parse(await response.json()).tags).toMatchObject({
      hook: "Mi gancho",
      format: "demo",
      onScreenText: false,
    });
    expect(await readCreative(creative.id)).toMatchObject({
      aiStatus: "done",
      tagHook: "Mi gancho",
      tagAngle: null,
      tagsEdited: 1,
    });
  });

  it("answers 404 for an unknown creative", async () => {
    const ctx = await setup();

    const response = await postSheet(
      ctx,
      crypto.randomUUID(),
      new FakeAiProvider(),
    );

    await expectError(response, 404, "NOT_FOUND");
  });
});

describe("POST /creatives/:id/retag", () => {
  it("queues the tag_creative job and answers 202", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { aiStatus: "failed" });
    const jobs = fakeJobs();

    const response = await postRetag(ctx, creative.id, jobs);

    expect(response.status).toBe(202);
    expect(retagResponseSchema.parse(await response.json())).toEqual({
      aiStatus: "queued",
    });
    expect((await readCreative(creative.id)).aiStatus).toBe("queued");
    expect(jobs.create).toHaveBeenCalledWith({
      id: expect.stringMatching(new RegExp(`^tag_creative-${creative.id}-`)),
      params: {
        kind: "tag_creative",
        key: expect.stringContaining(creative.id),
        workspaceId: ctx.workspace.id,
        payload: { creativeId: creative.id },
      },
    });
  });

  it.each(["uploading", "importing", "processing", "failed", "archived"])(
    "answers 409 CREATIVE_NOT_READY for a %s creative",
    async (status) => {
      const ctx = await setup();
      const creative = await seedCreative(ctx, { status });
      const jobs = fakeJobs();

      const response = await postRetag(ctx, creative.id, jobs);

      await expectError(response, 409, "CREATIVE_NOT_READY");
      expect(jobs.create).not.toHaveBeenCalled();
    },
  );

  it("answers 409 CREATIVE_NOT_READY without a thumbnail", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { thumbnailUrl: null });

    const response = await postRetag(ctx, creative.id);

    await expectError(response, 409, "CREATIVE_NOT_READY");
  });

  it.each([
    "https://evil.example.com/thumb.jpg",
    "https://fbcdn.net.evil.example/thumb.jpg",
    "http://scontent.xx.fbcdn.net/thumb.jpg",
    "https://169.254.169.254/thumb.jpg",
  ])("rejects the thumbnail host %s without queueing", async (url) => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { thumbnailUrl: url });
    const jobs = fakeJobs();

    const response = await postRetag(ctx, creative.id, jobs);

    await expectError(response, 502, "META_ERROR");
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it("answers 422 and leaves ai_status pending without budget", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { aiStatus: "done" });
    const jobs = fakeJobs();

    const response = await postRetag(ctx, creative.id, jobs, noBudget);

    await expectError(response, 422, "AI_BUDGET_EXHAUSTED");
    expect(jobs.create).not.toHaveBeenCalled();
    expect((await readCreative(creative.id)).aiStatus).toBe("pending");
  });
});

describe("job tag_creative", () => {
  it("tags from the Meta thumbnail downloaded by the server", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { aiStatus: "queued" });
    const requested = serveThumbnail();
    const provider = new FakeAiProvider({ describeImage: [tagsReply()] });

    await runJob(ctx, { creativeId: creative.id }, provider);

    expect(requested).toHaveBeenCalledTimes(1);
    const [call] = provider.callsTo("describeImage");
    expect(call!.input).toMatchObject({
      image: { bytes: THUMBNAIL_BYTES, mimeType: "image/jpeg" },
    });
    expect(await readCreative(creative.id)).toMatchObject({
      aiStatus: "done",
      tagHook: "Dolor de espalda",
      adNameSuggested: "dolor-de-espalda-ugc-prueba-social-1",
    });
    expect(await usageFor(ctx.workspace.id)).toMatchObject([
      { userId: null, refId: creative.id },
    ]);
  });

  it("does not overwrite the tags the user edited", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, {
      tagsEdited: 1,
      tagHook: "Mi gancho",
      tagAngle: "Mi angulo",
    });
    serveThumbnail();
    const provider = new FakeAiProvider({ describeImage: [tagsReply()] });

    await runJob(ctx, { creativeId: creative.id }, provider);

    expect(await readCreative(creative.id)).toMatchObject({
      aiStatus: "done",
      tagHook: "Mi gancho",
      tagAngle: "Mi angulo",
      tagsEdited: 1,
    });
  });

  it.each([
    "https://evil.example.com/thumb.jpg",
    "https://fbcdn.net.evil.example/thumb.jpg",
    "http://scontent.xx.fbcdn.net/thumb.jpg",
  ])("rejects the thumbnail host %s without fetching it", async (url) => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { thumbnailUrl: url });
    const requested = serveThumbnail(url);
    const provider = new FakeAiProvider();

    await expect(
      runJob(ctx, { creativeId: creative.id }, provider),
    ).rejects.toThrow("Untrusted thumbnail URL");

    expect(requested).not.toHaveBeenCalled();
    expect(provider.calls).toEqual([]);
    expect((await readCreative(creative.id)).aiStatus).toBe("failed");
  });

  it("marks ai_status failed when Meta no longer serves the thumbnail", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx);
    server.use(
      http.get(THUMBNAIL_URL, () => new HttpResponse(null, { status: 403 })),
    );

    await expect(
      runJob(ctx, { creativeId: creative.id }, new FakeAiProvider()),
    ).rejects.toThrow("Thumbnail unavailable");

    expect((await readCreative(creative.id)).aiStatus).toBe("failed");
  });

  it("leaves ai_status pending without budget and does not fail", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { aiStatus: "queued" });
    serveThumbnail();
    const provider = new FakeAiProvider();

    await runJob(ctx, { creativeId: creative.id }, provider, noBudget);

    expect(provider.calls).toEqual([]);
    expect((await readCreative(creative.id)).aiStatus).toBe("pending");
  });

  it("fails without retries for a creative that is not ready", async () => {
    const ctx = await setup();
    const creative = await seedCreative(ctx, { status: "processing" });

    await expect(
      runJob(ctx, { creativeId: creative.id }, new FakeAiProvider()),
    ).rejects.toThrow("CREATIVE_NOT_READY");
  });

  it("fails without retries for an invalid payload", async () => {
    const ctx = await setup();

    await expect(runJob(ctx, {}, new FakeAiProvider())).rejects.toThrow(
      "Invalid tag_creative job",
    );
  });
});
