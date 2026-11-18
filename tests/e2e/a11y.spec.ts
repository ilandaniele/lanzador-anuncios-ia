import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { readFileSync } from "node:fs";

type SessionState = Awaited<ReturnType<APIRequestContext["storageState"]>>;

const WORKSPACE_ID = "seed-workspace-a";
const OWNER_EMAIL = "owner-a@lanzador.test";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BLOCKING_IMPACTS = ["serious", "critical"];
const WIZARD_STEP_COUNT = 6;
const REFLOW_VIEWPORT = { width: 320, height: 640 };
const REFLOW_TOLERANCE_PX = 1;
const MOTION_TOLERANCE_SECONDS = 0.001;
const CSRF_HEADERS = { "X-Lanzador": "1" };
const MAGIC_LINK_CAPPED =
  "Magic link not issued: 5 per email in 15 minutes. Wait or reset local login links.";
const LOGIN_HEADING = "Ingresá a Lanzador";

const SEED_DRAFT = {
  adAccountAssetId: "seed-asset-account-1-a",
  pixelId: "130000000000001",
  pageId: "110000000000001",
  mode: "new_cbo",
  productId: "seed-product-1-a",
  copy: {
    primaryText: "Texto principal de prueba",
    headline: "Titular de prueba",
    description: "Descripcion de prueba",
    cta: "SHOP_NOW",
  },
  items: [1, 2].map((n) => ({
    source: "upload",
    creativeId: `seed-creative-${n}-a`,
    adName: `Anuncio ${n}`,
    mediaKind: "image",
  })),
  dailyBudgetMinor: 5000,
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  countries: ["AR"],
  optimizationEvent: "PURCHASE",
  campaignName: "Campaña a11y",
  adsetName: "Conjunto a11y",
};

const SIGNED_IN_PAGES = [
  { name: "metrics", path: "metricas", heading: "Métricas" },
  { name: "pilot", path: "piloto", heading: "Piloto" },
];

const PROGRESS_LAUNCHES = [
  { name: "verified launch", id: "seed-launch-ok-a" },
  { name: "launch with errors", id: "seed-launch-errors-a" },
];

function e2eSecret() {
  if (process.env.E2E_SECRET) return process.env.E2E_SECRET;
  const line = readFileSync(".dev.vars", "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("E2E_SECRET="));
  if (!line) throw new Error("E2E_SECRET missing in env and .dev.vars");
  return line.slice("E2E_SECRET=".length);
}

async function signIn(request: APIRequestContext, origin: string) {
  const headers = { Origin: origin, ...CSRF_HEADERS };
  const issued = await request.post("/api/test/magic-link", {
    headers: { ...headers, "X-E2E-Secret": e2eSecret() },
    data: { email: OWNER_EMAIL },
  });
  expect(issued.ok()).toBe(true);
  const { link } = (await issued.json()) as { link: string | null };
  if (!link) throw new Error(MAGIC_LINK_CAPPED);
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("t");
  const verified = await request.post("/api/auth/verify", {
    headers,
    data: { token },
  });
  expect(verified.ok()).toBe(true);
}

async function createDraft(request: APIRequestContext, origin: string) {
  const response = await request.post(`/api/w/${WORKSPACE_ID}/launches`, {
    headers: { Origin: origin, ...CSRF_HEADERS },
    data: { draft: SEED_DRAFT },
  });
  expect(response.ok()).toBe(true);
  const { launch } = (await response.json()) as { launch: { id: string } };
  return launch.id;
}

async function expectNoBlockingViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();
  const blocking = violations
    .filter(({ impact }) => BLOCKING_IMPACTS.includes(impact ?? ""))
    .map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map(({ target }) => target.join(" ")),
    }));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(REFLOW_TOLERANCE_PX);
}

async function expectFocusIndicator(page: Page) {
  await page.keyboard.press("Tab");
  const hasIndicator = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    const { outlineStyle, outlineWidth, boxShadow } = getComputedStyle(active);
    const outlined = outlineStyle !== "none" && parseFloat(outlineWidth) > 0;
    return outlined || boxShadow !== "none";
  });
  expect(hasIndicator).toBe(true);
}

async function expectNoMotion(page: Page) {
  const animated = await page.evaluate((toleranceSeconds) => {
    const isRunning = (durations: string) =>
      durations
        .split(",")
        .some((value) => parseFloat(value) > toleranceSeconds);
    return [...document.querySelectorAll("*")]
      .filter((element) => {
        const { animationDuration, transitionDuration } =
          getComputedStyle(element);
        return isRunning(animationDuration) || isRunning(transitionDuration);
      })
      .map((element) => element.tagName.toLowerCase());
  }, MOTION_TOLERANCE_SECONDS);
  expect(animated).toEqual([]);
}

async function open(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: heading }).first(),
  ).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

test.describe("login", () => {
  test("has no serious or critical violations", async ({ page }) => {
    await open(page, "/login", LOGIN_HEADING);

    await expectNoBlockingViolations(page);
  });

  test("shows a visible focus indicator on keyboard focus", async ({
    page,
  }) => {
    await open(page, "/login", LOGIN_HEADING);

    await expectFocusIndicator(page);
  });

  test("reflows at 320 px", async ({ page }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    await open(page, "/login", LOGIN_HEADING);

    await expectNoHorizontalScroll(page);
    await expectNoBlockingViolations(page);
  });

  test("honours prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/login", LOGIN_HEADING);

    await expectNoMotion(page);
  });
});

const signedIn = test.extend<
  { launchId: string },
  { session: { storageState: SessionState; launchId: string } }
>({
  session: [
    async ({ playwright }, use, { project }) => {
      const baseURL = project.use.baseURL!;
      const request = await playwright.request.newContext({ baseURL });
      await signIn(request, baseURL);
      const launchId = await createDraft(request, baseURL);
      const storageState = await request.storageState();
      await request.dispose();
      await use({ storageState, launchId });
    },
    { scope: "worker" },
  ],
  storageState: ({ session }, use) => use(session.storageState),
  launchId: ({ session }, use) => use(session.launchId),
});

const launcherPath = (launchId: string, step: number) =>
  `/w/${WORKSPACE_ID}/lanzador/${launchId}?paso=${step}`;

signedIn.describe("signed-in pages", () => {
  signedIn.describe.configure({ mode: "serial" });

  for (const { name, path, heading } of SIGNED_IN_PAGES) {
    signedIn(
      `${name} has no serious or critical violations`,
      async ({ page }) => {
        await open(page, `/w/${WORKSPACE_ID}/${path}`, heading);

        await expectNoBlockingViolations(page);
      },
    );

    signedIn(`${name} reflows at 320 px`, async ({ page }) => {
      await page.setViewportSize(REFLOW_VIEWPORT);
      await open(page, `/w/${WORKSPACE_ID}/${path}`, heading);

      await expectNoHorizontalScroll(page);
      await expectNoBlockingViolations(page);
    });
  }

  for (const { name, id } of PROGRESS_LAUNCHES) {
    const progressPath = `/w/${WORKSPACE_ID}/lanzador/${id}`;

    signedIn(
      `progress view of a ${name} has no serious or critical violations`,
      async ({ page }) => {
        await open(page, progressPath, "Lanzamiento");

        await expectNoBlockingViolations(page);
      },
    );

    signedIn(
      `progress view of a ${name} reflows at 320 px`,
      async ({ page }) => {
        await page.setViewportSize(REFLOW_VIEWPORT);
        await open(page, progressPath, "Lanzamiento");

        await expectNoHorizontalScroll(page);
        await expectNoBlockingViolations(page);
      },
    );
  }

  for (let step = 1; step <= WIZARD_STEP_COUNT; step++) {
    signedIn(
      `launcher step ${step} has no serious or critical violations`,
      async ({ page, launchId }) => {
        await open(page, launcherPath(launchId, step), "Lanzador");

        await expectNoBlockingViolations(page);
      },
    );

    signedIn(
      `launcher step ${step} reflows at 320 px`,
      async ({ page, launchId }) => {
        await page.setViewportSize(REFLOW_VIEWPORT);
        await open(page, launcherPath(launchId, step), "Lanzador");

        await expectNoHorizontalScroll(page);
        await expectNoBlockingViolations(page);
      },
    );
  }

  signedIn(
    "launcher shows a visible focus indicator on keyboard focus",
    async ({ page, launchId }) => {
      await open(page, launcherPath(launchId, 1), "Lanzador");

      await expectFocusIndicator(page);
    },
  );

  signedIn(
    "launcher honours prefers-reduced-motion",
    async ({ page, launchId }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await open(page, launcherPath(launchId, 1), "Lanzador");

      await expectNoMotion(page);
    },
  );
});
