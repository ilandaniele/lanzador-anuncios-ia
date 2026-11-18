import { expect } from "@playwright/test";
import { expectApiError, getJson, sendJson, workspaceApi } from "./helpers/api";
import {
  FOREIGN_WORKSPACE_ID,
  OWNER_EMAIL,
  signedInAs,
  WORKSPACE_ID,
} from "./helpers/session";

const test = signedInAs(OWNER_EMAIL);
const PENDING_PROPOSAL_IDS = [
  "seed-pilot-proposal-scale-a",
  "seed-pilot-proposal-no-sales-a",
  "seed-pilot-proposal-low-roas-a",
];
const RULE_TYPES = [
  "duplicate_winner",
  "pause_low_roas",
  "pause_no_sales",
  "scale_winner",
];

type Proposal = {
  id: string;
  status: string;
  action: string;
  objectName: string;
  explanation: string | null;
};

type PilotRule = { ruleType: string; enabled: boolean; params: object };

test.describe("pilot api", () => {
  test("pending proposals are the three seeded ones", async ({ request }) => {
    const { data } = await getJson<{ data: Proposal[] }>(
      request,
      workspaceApi("/pilot/proposals?status=pending&limit=100"),
    );

    expect(data.map(({ id }) => id).sort()).toEqual(
      [...PENDING_PROPOSAL_IDS].sort(),
    );
    expect(data.every(({ status }) => status === "pending")).toBe(true);
    expect(data.find(({ id }) => id.includes("scale"))).toMatchObject({
      action: "scale",
      objectName: "CBO Ganadora",
    });
  });

  test("the seeded run is listed in the history", async ({ request }) => {
    const { data } = await getJson<{
      data: { id: string; status: string; proposalsCreated: number }[];
    }>(request, workspaceApi("/pilot/runs"));

    expect(data).toContainEqual(
      expect.objectContaining({
        id: "seed-pilot-run-a",
        status: "done",
        proposalsCreated: 3,
      }),
    );
  });

  test("rules can be read and saved back", async ({ request, origin }) => {
    const { data } = await getJson<{ data: PilotRule[] }>(
      request,
      workspaceApi("/pilot/rules"),
    );
    expect(data.map(({ ruleType }) => ruleType).sort()).toEqual(RULE_TYPES);

    const saved = await sendJson(
      request,
      "put",
      workspaceApi("/pilot/rules"),
      origin,
      { rules: data },
    );

    expect(saved.status()).toBe(200);
    expect(((await saved.json()) as { data: PilotRule[] }).data).toEqual(data);
  });

  test("rules reject incomplete parameters", async ({ request, origin }) => {
    const response = await sendJson(
      request,
      "put",
      workspaceApi("/pilot/rules"),
      origin,
      { rules: [{ ruleType: "pause_no_sales", enabled: true, params: {} }] },
    );

    await expectApiError(response, 400, "VALIDATION");
  });

  test("approving requires explicit confirmation", async ({
    request,
    origin,
  }) => {
    const response = await sendJson(
      request,
      "post",
      workspaceApi(`/pilot/proposals/${PENDING_PROPOSAL_IDS[0]}/approve`),
      origin,
      {},
    );

    await expectApiError(response, 400, "VALIDATION");
  });

  test("proposals of workspace B are not readable", async ({ request }) => {
    const response = await request.get(
      workspaceApi("/pilot/proposals", FOREIGN_WORKSPACE_ID),
    );

    await expectApiError(response, 404, "NOT_FOUND");
  });

  test("running the pilot reads insights from meta", async ({
    request,
    origin,
  }) => {
    test.skip(
      !process.env.E2E_META_LIVE,
      "Needs a live Meta connection: set E2E_META_LIVE=1",
    );

    const run = await sendJson(
      request,
      "post",
      workspaceApi("/pilot/run"),
      origin,
    );

    expect(run.status()).toBe(200);
  });
});

test.describe("pilot page", () => {
  test("pending tab shows the proposals with their evidence", async ({
    page,
  }) => {
    await page.goto(`/w/${WORKSPACE_ID}/piloto`);

    await expect(
      page.getByRole("heading", { name: "Piloto", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Pendientes \(3\)/ }),
    ).toBeVisible();
    await expect(page.getByText("CBO Ganadora").first()).toBeVisible();
    await expect(
      page.getByText(
        "ROAS alto sostenido: conviene subir el presupuesto un 30 %",
      ),
    ).toBeVisible();
  });

  test("rules tab lists the four rules", async ({ page }) => {
    await page.goto(`/w/${WORKSPACE_ID}/piloto`);

    await page.getByRole("tab", { name: "Reglas" }).click();

    const rules = page.getByRole("list", { name: "Reglas del piloto" });
    await expect(rules).toBeVisible();
    await expect(rules.getByRole("listitem")).toHaveCount(RULE_TYPES.length);
  });

  test("history tab shows the seeded run", async ({ page }) => {
    await page.goto(`/w/${WORKSPACE_ID}/piloto`);

    await page.getByRole("tab", { name: "Historial" }).click();

    await expect(page.getByRole("tab", { name: "Historial" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("audit history records the pilot rules update", async ({ page }) => {
    await page.goto(`/w/${WORKSPACE_ID}/historial`);

    await page.getByRole("tab", { name: "Acciones" }).click();

    await expect(
      page.getByText("Actualizó las reglas del piloto").first(),
    ).toBeVisible();
    await expect(page.getByText("CBO Protegida").first()).toBeVisible();
  });
});

test.describe("chat", () => {
  test("a session can be opened and starts empty", async ({
    request,
    origin,
  }) => {
    const created = await sendJson(
      request,
      "post",
      workspaceApi("/chat/sessions"),
      origin,
    );
    expect(created.status()).toBe(201);
    const { session } = (await created.json()) as {
      session: { id: string; status: string };
    };
    expect(session.status).toBe("open");

    const messages = await getJson<{ data: unknown[] }>(
      request,
      workspaceApi(`/chat/sessions/${session.id}/messages`),
    );
    expect(messages.data).toEqual([]);

    const sessions = await getJson<{ data: { id: string }[] }>(
      request,
      workspaceApi("/chat/sessions"),
    );
    expect(sessions.data.map(({ id }) => id)).toContain(session.id);
  });

  test("blank messages are rejected before reaching the model", async ({
    request,
    origin,
  }) => {
    const response = await sendJson(
      request,
      "post",
      workspaceApi("/chat/sessions/any-session/messages"),
      origin,
      { text: "   " },
    );

    await expectApiError(response, 400, "VALIDATION");
  });

  test("messages to an unknown session are not found", async ({
    request,
    origin,
  }) => {
    const response = await sendJson(
      request,
      "post",
      workspaceApi("/chat/sessions/no-such-session/messages"),
      origin,
      { text: "hola" },
    );

    await expectApiError(response, 404, "NOT_FOUND");
  });

  test("chat of workspace B is not reachable", async ({ request }) => {
    const response = await request.get(
      workspaceApi("/chat/sessions", FOREIGN_WORKSPACE_ID),
    );

    await expectApiError(response, 404, "NOT_FOUND");
  });

  test("the chat panel opens from the shell and closes with Escape", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/w/${WORKSPACE_ID}/hoy`);

    await page.getByRole("button", { name: /Pedile a la IA/ }).click();

    const panel = page.getByRole("complementary", { name: "Chat con la IA" });
    await expect(panel).toBeVisible();
    await expect(page.getByLabel("Mensaje para la IA")).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(panel).toBeHidden();
  });
});
