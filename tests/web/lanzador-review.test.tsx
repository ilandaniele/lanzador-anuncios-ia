import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { CreativeDto } from "../../src/shared/schemas/creatives";
import type {
  LaunchDto,
  LaunchPlan,
  PartialLaunchDraft,
} from "../../src/shared/schemas/launch";
import type { AssetDto } from "../../src/shared/schemas/meta-connections";
import { WizardFooter } from "../../src/web/features/launch/WizardFooter";
import { createQueryClient } from "../../src/web/lib/query-client";
import LanzadorPage from "../../src/web/pages/lanzador/LanzadorPage";
import { Step5Budget } from "../../src/web/pages/lanzador/Step5Budget";
import { Step6Review } from "../../src/web/pages/lanzador/Step6Review";
import { server } from "../helpers/msw/server";
import { creativeDto } from "./helpers/upload-fakes";

const MAX_BUDGET_MINOR = 30000;

const completeDraft: PartialLaunchDraft = {
  adAccountAssetId: "a1",
  pageId: "page_1",
  pixelId: "pixel_1",
  mode: "new_cbo",
  productId: "p1",
  copy: {
    primaryText: "Llevate el combo completo",
    headline: "Combo con 20% off",
    cta: "SHOP_NOW",
  },
  items: [
    {
      source: "upload",
      creativeId: "c1",
      adName: "Video uno",
      mediaKind: "video",
    },
    {
      source: "upload",
      creativeId: "c2",
      adName: "Video dos",
      mediaKind: "video",
    },
  ],
  dailyBudgetMinor: 2000,
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  countries: ["AR"],
  optimizationEvent: "PURCHASE",
  campaignName: "Campaña {producto}",
  adsetName: "Conjunto {n}",
};

const asset = (overrides: Partial<AssetDto>): AssetDto => ({
  id: "a1",
  kind: "ad_account",
  metaId: "act_1",
  name: "Cuenta sana",
  parentMetaId: null,
  currency: "USD",
  enabled: true,
  health: {
    accountStatus: 1,
    disableReason: 0,
    fundingOk: true,
    spendCapPct: null,
    checkedAt: "2026-01-01T00:00:00.000Z",
  },
  ...overrides,
});

const assets: AssetDto[] = [
  asset({}),
  asset({ id: "pg1", kind: "page", metaId: "page_1", name: "Mi página" }),
  asset({ id: "px1", kind: "pixel", metaId: "pixel_1", name: "Píxel tienda" }),
];

const plan = (overrides: Partial<LaunchPlan> = {}): LaunchPlan => ({
  campaign: {
    name: "Campaña Combo",
    dailyBudgetMinor: 2000,
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  },
  adset: {
    name: "Conjunto 1",
    countries: ["AR"],
    optimizationEvent: "PURCHASE",
  },
  ads: [0, 1].map((position) => ({
    position,
    adName: position === 0 ? "Video uno" : "Video dos",
    mediaKind: "video" as const,
    link: "https://tienda.test/combo?utm_source=meta",
    pageId: "page_1",
    instagramUserId: null,
  })),
  warnings: [],
  blockers: [],
  planHash: "hash1",
  ...overrides,
});

const launch = (draft: PartialLaunchDraft): LaunchDto => ({
  id: "l1",
  status: "draft",
  phase: null,
  source: "manual",
  mode: null,
  adAccountAssetId: null,
  currency: null,
  productId: null,
  draft,
  planHash: null,
  dailyBudgetMinor: null,
  startAt: null,
  metaCampaignUrl: null,
  itemsTotal: 0,
  itemsDone: 0,
  itemsFailed: 0,
  checksOk: null,
  errorCode: null,
  errorMessage: null,
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  activatedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const errorResponse = (
  status: number,
  code: string,
  fields?: Record<string, string>,
) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "r1", fields } },
    { status },
  );

function useBackend({
  saved = null,
  draft = completeDraft,
}: { saved?: LaunchPlan | null; draft?: PartialLaunchDraft } = {}) {
  const creatives: CreativeDto[] = ["c1", "c2"].map((id) => ({
    ...creativeDto("ready"),
    id,
    thumbnailUrl: `https://cdn.test/${id}.jpg`,
  }));
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        user: { id: "u1", email: "a@b.c", name: "Ana", isSuperadmin: false },
        workspaces: [
          { id: "w1", name: "Mi negocio", role: "editor", status: "active" },
        ],
      }),
    ),
    http.get("/api/w/w1", () =>
      HttpResponse.json({
        workspace: {},
        role: "editor",
        plan: { id: "p", name: "Beta", limits: { maxCreativesPerLaunch: 30 } },
        settings: {
          maxCampaignBudgetMinor: MAX_BUDGET_MINOR,
          budgetCurrency: "USD",
          defaultCountries: ["AR"],
          advantageCreativeEnabled: false,
          timezone: "America/Argentina/Buenos_Aires",
          nameTemplates: { campaign: "c", adset: "a", ad: "x" },
          launchDefaults: {},
        },
        aiUsage: {},
      }),
    ),
    http.get("/api/w/w1/meta/assets", () =>
      HttpResponse.json({ data: assets, nextCursor: null }),
    ),
    http.get("/api/w/w1/creatives", () =>
      HttpResponse.json({ data: creatives, nextCursor: null }),
    ),
    http.get("/api/w/w1/launches/l1", () =>
      HttpResponse.json({
        launch: { ...launch(draft), status: saved ? "simulated" : "draft" },
        items: [],
        checks: null,
        plan: saved,
      }),
    ),
  );
}

function useSimulate(respond: () => Response) {
  const simulate = vi.fn();
  server.use(
    http.post("/api/w/w1/launches/l1/simulate", () => {
      simulate();
      return respond();
    }),
  );
  return simulate;
}

function useStart(respond: () => Response) {
  const start = vi.fn();
  server.use(
    http.post("/api/w/w1/launches/l1/start", async ({ request }) => {
      start(await request.json());
      return respond();
    }),
  );
  return start;
}

function SearchProbe() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function renderReview(draft: PartialLaunchDraft = completeDraft) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/w/w1/lanzador/l1?paso=6"]}>
        <Routes>
          <Route
            path="/w/:workspaceId/lanzador/:launchId"
            element={
              <Step6Review
                workspaceId="w1"
                draft={draft}
                update={() => undefined}
                setBlockReason={() => undefined}
              />
            }
          />
        </Routes>
        <SearchProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function BudgetHarness({
  initial,
  onDraft,
}: {
  initial: PartialLaunchDraft;
  onDraft: (draft: PartialLaunchDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  onDraft(draft);
  return (
    <>
      <Step5Budget
        workspaceId="w1"
        draft={draft}
        update={(changes) =>
          setDraft((previous) => ({ ...previous, ...changes }))
        }
        setBlockReason={setBlockReason}
      />
      <WizardFooter
        saveState="saved"
        onNext={() => undefined}
        nextBlockedReason={blockReason ?? undefined}
      />
    </>
  );
}

function renderBudget(initial: PartialLaunchDraft = { mode: "new_cbo" }) {
  let latest = initial;
  render(
    <QueryClientProvider client={createQueryClient()}>
      <BudgetHarness initial={initial} onDraft={(draft) => (latest = draft)} />
    </QueryClientProvider>,
  );
  return { lastDraft: () => latest };
}

const nextButton = () => screen.getByRole("button", { name: "Siguiente" });
const stepLinkHref = async (text: RegExp | string) =>
  within((await screen.findByText(text)).closest("li")!)
    .getByRole("link", { name: /Ir al paso/ })
    .getAttribute("href");

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Lanzador > paso 5", () => {
  it("writes the AR default, the purchase event and Mayor volumen into the draft", async () => {
    useBackend();
    const { lastDraft } = renderBudget();

    await waitFor(() =>
      expect(lastDraft()).toMatchObject({
        countries: ["AR"],
        optimizationEvent: "PURCHASE",
        bidStrategy: "LOWEST_COST_WITHOUT_CAP",
      }),
    );
    expect(await screen.findByText("AR")).toBeTruthy();
    expect(screen.getByText("Compra")).toBeTruthy();
  });

  it("shows the workspace cap and blocks Siguiente above it", async () => {
    useBackend();
    const { lastDraft } = renderBudget();

    expect(await screen.findByText(/Tope del workspace/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Presupuesto diario/), {
      target: { value: "400" },
    });

    expect(lastDraft().dailyBudgetMinor).toBe(40000);
    expect(
      screen.getAllByText("El presupuesto supera el tope del workspace."),
    ).not.toHaveLength(0);
    expect(nextButton().getAttribute("aria-disabled")).toBe("true");

    fireEvent.change(screen.getByLabelText(/Presupuesto diario/), {
      target: { value: "250" },
    });
    expect(nextButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("asks for the target cost only with Límite de costo", async () => {
    useBackend();
    const { lastDraft } = renderBudget();

    await screen.findByText(/Tope del workspace/);
    expect(screen.queryByLabelText(/Costo objetivo por compra/)).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Límite de costo" }));
    fireEvent.change(screen.getByLabelText(/Costo objetivo por compra/), {
      target: { value: "12,50" },
    });

    expect(lastDraft()).toMatchObject({
      bidStrategy: "COST_CAP",
      bidAmountMinor: 1250,
    });
  });

  it("adds and removes countries and rejects invalid codes", async () => {
    useBackend();
    const { lastDraft } = renderBudget();

    const input = await screen.findByLabelText(/Agregar país/);
    fireEvent.change(input, { target: { value: "xyz" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(
      screen.getByText("Usá el código de 2 letras, por ejemplo AR."),
    ).toBeTruthy();

    fireEvent.change(input, { target: { value: "br" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(lastDraft().countries).toEqual(["AR", "BR"]));

    fireEvent.click(screen.getByRole("button", { name: "Quitar AR" }));
    expect(lastDraft().countries).toEqual(["BR"]);
  });

  it("hides the budget for an existing campaign", async () => {
    useBackend();
    renderBudget({ mode: "existing_cbo" });

    expect(
      await screen.findByText(
        "El presupuesto lo define la campaña que elegiste.",
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/Presupuesto diario/)).toBeNull();
  });

  it("stores Programar inicio as an ISO date and blocks a past date", async () => {
    useBackend();
    const { lastDraft } = renderBudget();

    fireEvent.click(
      await screen.findByRole("checkbox", { name: /Programar inicio/ }),
    );
    const input = screen.getByLabelText(/Fecha y hora de inicio/);

    fireEvent.change(input, { target: { value: "2020-01-01T10:00" } });
    expect(
      screen.getAllByText("Elegí una fecha y hora futuras."),
    ).not.toHaveLength(0);
    expect(nextButton().getAttribute("aria-disabled")).toBe("true");

    fireEvent.change(input, { target: { value: "2099-01-01T10:00" } });
    expect(lastDraft().startAt).toBe(
      new Date("2099-01-01T10:00").toISOString(),
    );
    expect(nextButton().getAttribute("aria-disabled")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: /Programar inicio/ }));
    expect(lastDraft().startAt).toBeUndefined();
  });
});

describe("Lanzador > paso 6", () => {
  it("previews every copy, creative and CTA combination and the receipt", async () => {
    useBackend();
    renderReview();

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);
    const [first] = cards;
    expect(within(first!).getByText("Video uno")).toBeTruthy();
    expect(within(first!).getByText("Combo con 20% off")).toBeTruthy();
    expect(within(first!).getByText("Llevate el combo completo")).toBeTruthy();
    expect(within(first!).getByText("Comprar ahora")).toBeTruthy();
    await waitFor(() =>
      expect(within(first!).getByRole("img").getAttribute("src")).toBe(
        "https://cdn.test/c1.jpg",
      ),
    );
    expect(screen.getByText("Cuenta sana")).toBeTruthy();
    expect(screen.getByText("Mi página")).toBeTruthy();
    expect(screen.getByText("Desactivado")).toBeTruthy();
  });

  it("BLOCKERS: lists each plan blocker with a link to its step", async () => {
    useBackend();
    useSimulate(() =>
      HttpResponse.json(
        plan({
          blockers: [
            {
              code: "CREATIVE_NOT_READY",
              text: "Video uno: El creativo no terminó",
            },
            {
              code: "LANDING_ERROR",
              text: "La landing del producto no responde",
            },
            { code: "ACCOUNT_NOT_USD", text: "La cuenta no opera en USD" },
          ],
        }),
      ),
    );
    renderReview();

    fireEvent.click(await screen.findByRole("button", { name: "Simular" }));

    expect(await stepLinkHref("Video uno: El creativo no terminó")).toContain(
      "paso=4",
    );
    expect(await stepLinkHref("La landing del producto no responde")).toContain(
      "paso=3",
    );
    expect(await stepLinkHref("La cuenta no opera en USD")).toContain("paso=1");
    expect(
      screen
        .getByRole("button", { name: "Lanzar en pausa" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("BLOCKERS: lists each incomplete draft field returned by simulate", async () => {
    useBackend();
    useSimulate(() =>
      errorResponse(422, "BLOCKERS", {
        countries: "too_small",
        "items.0.adName": "too_small",
      }),
    );
    renderReview();

    fireEvent.click(await screen.findByRole("button", { name: "Simular" }));

    expect(await stepLinkHref(/^Países:/)).toContain("paso=5");
    expect(await stepLinkHref(/^Creativos del lanzamiento:/)).toContain(
      "paso=4",
    );
  });

  it("shows the valid plan and launches only after the receipt is confirmed", async () => {
    useBackend();
    useSimulate(() => HttpResponse.json(plan()));
    const start = useStart(() =>
      HttpResponse.json({ status: "queued" }, { status: 202 }),
    );
    renderReview();

    fireEvent.click(await screen.findByRole("button", { name: "Simular" }));
    expect(
      await screen.findByText(
        "Plan válido: se crean 1 campaña, 1 conjunto, 2 anuncios",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Campaña Combo")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lanzar en pausa" }));
    const dialog = await screen.findByRole("dialog");
    expect(start).not.toHaveBeenCalled();
    expect(within(dialog).getByText("En pausa")).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Lanzar en pausa" }),
    );

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith({ confirm: true, planHash: "hash1" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe(""),
    );
  });

  it("PLAN_CHANGED: asks to simulate again and blocks the launch", async () => {
    useBackend();
    useSimulate(() => HttpResponse.json(plan()));
    useStart(() => errorResponse(409, "PLAN_CHANGED"));
    renderReview();

    fireEvent.click(await screen.findByRole("button", { name: "Simular" }));
    await screen.findByText(/Plan válido/);
    fireEvent.click(screen.getByRole("button", { name: "Lanzar en pausa" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Lanzar en pausa" }),
    );

    expect(
      await screen.findByText(
        "El plan cambió desde la simulación. Simulá de nuevo para ver el plan actualizado.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/Plan válido/)).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Lanzar en pausa" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("BLOCKERS on start: lists each blocker with a link to its step", async () => {
    useBackend();
    useSimulate(() => HttpResponse.json(plan()));
    useStart(() =>
      errorResponse(422, "BLOCKERS", {
        MEDIA_NOT_IN_ACCOUNT: "Volvé a subirlo para esta cuenta",
      }),
    );
    renderReview();

    fireEvent.click(await screen.findByRole("button", { name: "Simular" }));
    await screen.findByText(/Plan válido/);
    fireEvent.click(screen.getByRole("button", { name: "Lanzar en pausa" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Lanzar en pausa",
      }),
    );

    expect(
      (await screen.findByText("Volvé a subirlo para esta cuenta")).closest(
        "li",
      ),
    ).toBeTruthy();
    expect(await stepLinkHref("Volvé a subirlo para esta cuenta")).toContain(
      "paso=4",
    );
  });

  it("keeps the dialog open with a message on a generic start failure", async () => {
    useBackend();
    useSimulate(() => HttpResponse.json(plan()));
    useStart(() => errorResponse(500, "INTERNAL"));
    renderReview();

    fireEvent.click(await screen.findByRole("button", { name: "Simular" }));
    await screen.findByText(/Plan válido/);
    fireEvent.click(screen.getByRole("button", { name: "Lanzar en pausa" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Lanzar en pausa",
      }),
    );

    expect(
      await within(screen.getByRole("dialog")).findByText(
        "No pudimos lanzar. Probá de nuevo.",
      ),
    ).toBeTruthy();
  });

  it("offers Conexiones when Meta asks to reconnect", async () => {
    useBackend();
    useSimulate(() => errorResponse(409, "META_RECONNECT_REQUIRED"));
    renderReview();

    fireEvent.click(await screen.findByRole("button", { name: "Simular" }));

    expect(
      await screen.findByText(
        "Meta pide reconectar la cuenta antes de seguir.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Ir a Conexiones" })
        .getAttribute("href"),
    ).toBe("/w/w1/ajustes/conexiones");
  });

  it("restores the simulated plan saved on the server", async () => {
    useBackend({
      saved: plan({ warnings: [{ code: "W", text: "Pocos anuncios" }] }),
    });
    renderReview();

    expect(
      await screen.findByText(
        "Plan válido: se crean 1 campaña, 1 conjunto, 2 anuncios",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Pocos anuncios")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Lanzar en pausa" })
        .getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("opens from ?paso=6 inside the wizard", async () => {
    useBackend();
    server.use(
      http.patch("/api/w/w1/launches/l1", () =>
        HttpResponse.json({ launch: launch(completeDraft) }),
      ),
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/w/w1/lanzador/l1?paso=6"]}>
          <Routes>
            <Route
              path="/w/:workspaceId/lanzador/:launchId"
              element={<LanzadorPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "Simular" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /Revisión/ })
        .getAttribute("aria-current"),
    ).toBe("step");
  });
});
