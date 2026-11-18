import { expect, test } from "@playwright/test";
import { expectApiError, getJson, sendJson, workspaceApi } from "./helpers/api";
import {
  FOREIGN_WORKSPACE_ID,
  OWNER_EMAIL,
  signedInAs,
  VIEWER_EMAIL,
  WORKSPACE_ID,
} from "./helpers/session";

const owner = signedInAs(OWNER_EMAIL);
const viewer = signedInAs(VIEWER_EMAIL);
const NOT_A_MEMBER_STATUSES = [403, 404];

test.describe("without a session", () => {
  test("api rejects unauthenticated requests with 401", async ({ request }) => {
    for (const path of ["/api/me", workspaceApi("")]) {
      await expectApiError(await request.get(path), 401, "UNAUTHENTICATED");
    }
  });

  test("workspace page redirects to login keeping the target", async ({
    page,
  }) => {
    const target = `/w/${WORKSPACE_ID}/hoy`;
    await page.goto(target);

    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=${encodeURIComponent(target)}$`),
    );
    await expect(
      page.getByRole("heading", { name: "Ingresá a Lanzador" }),
    ).toBeVisible();
  });
});

owner.describe("as the owner of workspace A", () => {
  owner("me lists the owned workspace", async ({ request }) => {
    const me = await getJson<{
      user: { email: string; isSuperadmin: boolean };
      workspaces: { id: string; role: string }[];
    }>(request, "/api/me");

    expect(me.user).toMatchObject({
      email: OWNER_EMAIL,
      isSuperadmin: false,
    });
    expect(me.workspaces).toContainEqual(
      expect.objectContaining({ id: WORKSPACE_ID, role: "owner" }),
    );
  });

  owner(
    "workspace overview exposes role, plan and settings",
    async ({ request }) => {
      const overview = await getJson<{
        workspace: { id: string; name: string };
        role: string;
        plan: { id: string };
        settings: { budgetCurrency: string };
      }>(request, workspaceApi(""));

      expect(overview.workspace).toMatchObject({
        id: WORKSPACE_ID,
        name: "Marca Demo",
      });
      expect(overview.role).toBe("owner");
      expect(overview.plan.id).toBe("beta");
      expect(overview.settings.budgetCurrency).toBe("USD");
    },
  );

  owner(
    "mutations without the CSRF header are rejected",
    async ({ request }) => {
      const response = await request.post(workspaceApi("/chat/sessions"), {
        data: {},
      });

      await expectApiError(response, 403, "CSRF_FAILED");
    },
  );

  owner("home redirects into the workspace Hoy page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(new RegExp(`/w/${WORKSPACE_ID}/hoy$`));
    await expect(
      page.getByRole("heading", { name: "Hoy", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Cuenta 1").first()).toBeVisible();
  });

  owner("cannot read workspace B through the api", async ({ request }) => {
    for (const path of ["", "/launches", "/launches/seed-launch-ok-b"]) {
      const response = await request.get(
        workspaceApi(path, FOREIGN_WORKSPACE_ID),
      );

      expect(NOT_A_MEMBER_STATUSES).toContain(response.status());
    }
  });

  owner(
    "cannot mutate workspace B through the api",
    async ({ request, origin }) => {
      const response = await sendJson(
        request,
        "patch",
        workspaceApi("", FOREIGN_WORKSPACE_ID),
        origin,
        { name: "Hijacked" },
      );

      expect(NOT_A_MEMBER_STATUSES).toContain(response.status());
    },
  );

  owner("workspace B page shows not found", async ({ page }) => {
    await page.goto(`/w/${FOREIGN_WORKSPACE_ID}/hoy`);

    await expect(
      page.getByRole("heading", { name: "No encontramos esta página" }),
    ).toBeVisible();
  });

  owner(
    "non-superadmin gets not found on admin routes",
    async ({ request, page }) => {
      await expectApiError(
        await request.get("/api/admin/usage"),
        404,
        "NOT_FOUND",
      );
      await page.goto("/admin");

      await expect(
        page.getByRole("heading", { name: "No encontramos esta página" }),
      ).toBeVisible();
    },
  );
});

viewer.describe("as a viewer of workspace A", () => {
  viewer("can read the workspace", async ({ request }) => {
    const overview = await getJson<{ role: string }>(request, workspaceApi(""));

    expect(overview.role).toBe("viewer");
  });

  viewer("cannot change workspace settings", async ({ request, origin }) => {
    const response = await sendJson(
      request,
      "patch",
      workspaceApi("/settings"),
      origin,
      { maxScalePercent: 10 },
    );

    await expectApiError(response, 403, "FORBIDDEN_ROLE");
  });

  viewer("cannot create launch drafts", async ({ request, origin }) => {
    const response = await sendJson(
      request,
      "post",
      workspaceApi("/launches"),
      origin,
      { draft: {} },
    );

    await expectApiError(response, 403, "FORBIDDEN_ROLE");
  });
});
