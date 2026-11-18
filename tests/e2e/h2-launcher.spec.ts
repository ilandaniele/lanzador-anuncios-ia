import { expect } from "@playwright/test";
import { expectApiError, getJson, sendJson, workspaceApi } from "./helpers/api";
import { createDraft } from "./helpers/launch";
import { OWNER_EMAIL, signedInAs, WORKSPACE_ID } from "./helpers/session";

const test = signedInAs(OWNER_EMAIL);
const FIRST_STEP = 1;
const REVIEW_STEP = 6;

type LaunchSummary = {
  id: string;
  status: string;
  itemsTotal: number;
  itemsFailed: number;
};

const launcherPath = (launchId: string, step?: number) =>
  `/w/${WORKSPACE_ID}/lanzador/${launchId}${step ? `?paso=${step}` : ""}`;

test.describe("seeded launches", () => {
  test("history lists both seeded launches with their status", async ({
    request,
  }) => {
    const { data } = await getJson<{ data: LaunchSummary[] }>(
      request,
      workspaceApi("/launches?limit=100"),
    );

    expect(data).toContainEqual(
      expect.objectContaining({
        id: "seed-launch-ok-a",
        status: "paused_verified",
        itemsTotal: 3,
        itemsFailed: 0,
      }),
    );
    expect(data).toContainEqual(
      expect.objectContaining({
        id: "seed-launch-errors-a",
        status: "verified_with_errors",
        itemsFailed: 1,
      }),
    );
  });

  test("progress api reports verification checks and failed items", async ({
    request,
  }) => {
    const progress = await getJson<{
      status: string;
      counts: { total: number; done: number; failed: number };
      items: { status: string; error?: string }[];
      checks: { code: string; ok: boolean }[];
    }>(request, workspaceApi("/launches/seed-launch-errors-a/progress"));

    expect(progress.status).toBe("verified_with_errors");
    expect(progress.counts).toEqual({ total: 3, done: 2, failed: 1 });
    expect(progress.items.filter(({ status }) => status === "failed")).toEqual([
      expect.objectContaining({ error: "El creativo no terminó" }),
    ]);
    expect(progress.checks).toContainEqual({
      ok: false,
      code: "ALL_ADS_CREATED",
      text: "Todos los anuncios creados",
    });
  });

  test("progress view of a verified launch shows the ads", async ({ page }) => {
    await page.goto(launcherPath("seed-launch-ok-a"));

    await expect(
      page.getByRole("heading", { name: /Lanzamiento: .*seed ok/ }),
    ).toBeVisible();
    await expect(page.getByText("Creativo 1 1")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reintentar fallidos" }),
    ).toHaveCount(0);
  });

  test("progress view of a launch with errors offers a retry", async ({
    page,
  }) => {
    await page.goto(launcherPath("seed-launch-errors-a"));

    await expect(
      page.getByRole("heading", { name: /Lanzamiento: .*seed errors/ }),
    ).toBeVisible();
    await expect(page.getByText("El creativo no terminó")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reintentar fallidos" }),
    ).toBeVisible();
  });

  test("launch of workspace B is not reachable", async ({ request }) => {
    const response = await request.get(
      workspaceApi("/launches/seed-launch-ok-b"),
    );

    await expectApiError(response, 404, "NOT_FOUND");
  });
});

test.describe("draft lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  let draftId: string;

  test.beforeAll(async ({ playwright, session }, { project }) => {
    const baseURL = project.use.baseURL!;
    const request = await playwright.request.newContext({
      baseURL,
      storageState: session,
    });
    draftId = await createDraft(request, baseURL, "e2e h2");
    await request.dispose();
  });

  test("draft is stored and editable", async ({ request, origin }) => {
    const created = await getJson<{
      launch: { status: string; draft: { campaignName: string } };
    }>(request, workspaceApi(`/launches/${draftId}`));
    expect(created.launch.status).toBe("draft");
    expect(created.launch.draft.campaignName).toBe("Campaña e2e h2");

    const patched = await sendJson(
      request,
      "patch",
      workspaceApi(`/launches/${draftId}`),
      origin,
      { draft: { ...created.launch.draft, campaignName: "Campaña e2e h2 v2" } },
    );

    expect(patched.status()).toBe(200);
  });

  test("invalid draft is rejected with a validation error", async ({
    request,
    origin,
  }) => {
    const response = await sendJson(
      request,
      "post",
      workspaceApi("/launches"),
      origin,
      { draft: { dailyBudgetMinor: "mucho" } },
    );

    await expectApiError(response, 400, "VALIDATION");
  });

  test("wizard opens on the first and the review step", async ({ page }) => {
    await page.goto(launcherPath(draftId, FIRST_STEP));
    await expect(page.getByRole("heading", { name: "Lanzador" })).toBeVisible();
    await expect(page.getByText("Cuenta 1").first()).toBeVisible();

    await page.goto(launcherPath(draftId, REVIEW_STEP));
    await expect(page.getByRole("heading", { name: "Lanzador" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Simular" }).first(),
    ).toBeVisible();
  });

  test("draft can be discarded", async ({ request, origin }) => {
    const discarded = await sendJson(
      request,
      "post",
      workspaceApi(`/launches/${draftId}/discard`),
      origin,
    );
    expect(discarded.ok()).toBe(true);

    const { launch } = await getJson<{ launch: { status: string } }>(
      request,
      workspaceApi(`/launches/${draftId}`),
    );
    expect(launch.status).toBe("discarded");
  });
});

test.describe("external connections", () => {
  test("meta connect returns an authorize url", async ({ request, origin }) => {
    const response = await sendJson(
      request,
      "post",
      workspaceApi("/meta/connect"),
      origin,
    );
    expect(response.status()).toBe(200);
    const { authorizeUrl } = (await response.json()) as {
      authorizeUrl: string;
    };
    const params = new URL(authorizeUrl).searchParams;
    test.skip(!params.get("client_id"), "META_APP_ID is not configured");

    expect(new URL(authorizeUrl).host).toBe("www.facebook.com");
    expect(params.get("state")).toBeTruthy();
  });

  test("google picker token is issued once drive is connected", async ({
    request,
  }) => {
    const { connected } = await getJson<{ connected: boolean }>(
      request,
      workspaceApi("/google/connection"),
    );
    test.skip(!connected, "Google Drive is not connected for this workspace");

    const { token } = await getJson<{ token: string }>(
      request,
      workspaceApi("/google/picker-token"),
    );
    expect(token).toBeTruthy();
  });
});
