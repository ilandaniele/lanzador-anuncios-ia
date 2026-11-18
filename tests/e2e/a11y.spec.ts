import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createDraft } from "./helpers/launch";
import {
  OWNER_EMAIL,
  pacedTest,
  SIGN_IN_TIMEOUT_MS,
  signedInState,
  type SessionState,
  WORKSPACE_ID,
} from "./helpers/session";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BLOCKING_IMPACTS = ["serious", "critical"];
const WIZARD_STEP_COUNT = 6;
const REFLOW_VIEWPORT = { width: 320, height: 640 };
const REFLOW_TOLERANCE_PX = 1;
const MOTION_TOLERANCE_SECONDS = 0.001;
const LOGIN_HEADING = "Ingresá a Lanzador";

const SIGNED_IN_PAGES = [
  { name: "metrics", path: "metricas", heading: "Métricas" },
  { name: "pilot", path: "piloto", heading: "Piloto" },
];

const PROGRESS_LAUNCHES = [
  { name: "verified launch", id: "seed-launch-ok-a" },
  { name: "launch with errors", id: "seed-launch-errors-a" },
];

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

const signedIn = pacedTest.extend<
  { launchId: string },
  { session: { storageState: SessionState; launchId: string } }
>({
  session: [
    async ({ playwright }, use, { project }) => {
      const baseURL = project.use.baseURL!;
      const storageState = await signedInState(
        playwright,
        baseURL,
        OWNER_EMAIL,
      );
      const request = await playwright.request.newContext({
        baseURL,
        storageState,
      });
      const launchId = await createDraft(request, baseURL, "a11y");
      await request.dispose();
      await use({ storageState, launchId });
    },
    { scope: "worker", timeout: SIGN_IN_TIMEOUT_MS },
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
