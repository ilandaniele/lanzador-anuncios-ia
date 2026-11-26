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
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AssetDto } from "../../src/shared/schemas/meta-connections";
import type { TopAdDto, WinningTagDto } from "../../src/shared/schemas/metrics";
import type { ProductListItemDto } from "../../src/shared/schemas/products";
import { createQueryClient } from "../../src/web/lib/query-client";
import MetricasPage from "../../src/web/pages/metricas/MetricasPage";
import { server } from "../helpers/msw/server";

const account = (id: string, name: string): AssetDto => ({
  id,
  kind: "ad_account",
  metaId: `act_${id}`,
  name,
  parentMetaId: null,
  currency: "USD",
  enabled: true,
  health: {
    accountStatus: 1,
    disableReason: null,
    fundingOk: true,
    spendCapPct: null,
    checkedAt: null,
  },
});

const product = (id: string, breakEvenRoas: number | null) =>
  ({
    id,
    name: "Zapatillas",
    landingUrl: "https://tienda.example.com",
    headline: "Zapatillas",
    primaryText: "Zapatillas",
    cta: "SHOP_NOW",
    landingStatus: "ok",
    breakEvenRoas,
    archived: false,
  }) satisfies ProductListItemDto;

const topAd = (overrides: Partial<TopAdDto>): TopAdDto => ({
  adId: "ad1",
  name: "Anuncio Uno",
  adAccountId: "acc1",
  currency: "USD",
  storyId: "story1",
  thumbnailUrl: "https://cdn.example.com/1.jpg",
  spendMinor: 50000,
  roas: 3.2,
  purchases: 14,
  ...overrides,
});

const TOP_ADS: TopAdDto[] = [
  topAd({}),
  topAd({ adId: "ad2", name: "Anuncio Dos", storyId: "story2", roas: 2.8 }),
  topAd({ adId: "ad3", name: "Anuncio Tres", storyId: null, roas: 2.1 }),
  topAd({
    adId: "ad4",
    name: "Anuncio Cuatro",
    adAccountId: "acc2",
    roas: null,
  }),
];

const tag = (overrides: Partial<WinningTagDto>): WinningTagDto => ({
  tag: "pregunta",
  currency: "USD",
  ads: 4,
  spendMinor: 80000,
  purchases: 20,
  roas: 3,
  cpaMinor: 4000,
  ...overrides,
});

const TAGS: WinningTagDto[] = [
  tag({}),
  tag({ tag: "testimonio", roas: 1.2, cpaMinor: 9000, ads: 2 }),
];

function useBackend({
  role = "editor",
  topAds = TOP_ADS,
  tags = TAGS,
  failTopAds = false,
  failCreate = false,
}: {
  role?: "viewer" | "editor";
  topAds?: TopAdDto[];
  tags?: WinningTagDto[];
  failTopAds?: boolean;
  failCreate?: boolean;
} = {}) {
  const calls = {
    topAds: vi.fn(),
    winningTags: vi.fn(),
    createLaunch: vi.fn(),
  };
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        user: { id: "u1", email: "ana@example.com", name: "Ana" },
        workspaces: [
          {
            id: "w1",
            name: "Mi negocio",
            role,
            status: "active",
            billingBlocked: false,
          },
        ],
      }),
    ),
    http.get("/api/w/w1/meta/assets", () =>
      HttpResponse.json({
        data: [
          account("acc1", "Cuenta Uruguay"),
          account("acc2", "Cuenta Chile"),
        ],
        nextCursor: null,
      }),
    ),
    http.get("/api/w/w1/products", () =>
      HttpResponse.json({ data: [product("p1", 1.67)], nextCursor: null }),
    ),
    http.get("/api/w/w1/metrics/top-ads", ({ request }) => {
      calls.topAds(Object.fromEntries(new URL(request.url).searchParams));
      if (failTopAds)
        return HttpResponse.json(
          { error: { code: "INTERNAL", message: "x", requestId: "r1" } },
          { status: 422 },
        );
      return HttpResponse.json({ data: topAds });
    }),
    http.get("/api/w/w1/metrics/winning-tags", ({ request }) => {
      calls.winningTags(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json({ data: tags });
    }),
    http.post("/api/w/w1/launches", async ({ request }) => {
      calls.createLaunch(await request.json());
      if (failCreate)
        return HttpResponse.json(
          { error: { code: "INTERNAL", message: "x", requestId: "r2" } },
          { status: 500 },
        );
      return HttpResponse.json({ launch: { id: "l1" } }, { status: 201 });
    }),
  );
  return calls;
}

function LaunchProbe() {
  return <output data-testid="launch">{useParams().launchId}</output>;
}

function renderAt(path: string) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/w/:workspaceId/metricas" element={<MetricasPage />} />
          <Route
            path="/w/:workspaceId/lanzador/:launchId"
            element={<LaunchProbe />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const TOP_ADS_PATH = "/w/w1/metricas?tab=mejores-anuncios";
const WINNING_PATH = "/w/w1/metricas?tab=que-gana";

const lastCall = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.lastCall?.[0] as Record<string, unknown>;

const choose = async (name: string) => {
  const checkbox = await screen.findByRole("checkbox", {
    name: `Elegir ${name}`,
  });
  fireEvent.click(checkbox);
  return checkbox as HTMLInputElement;
};

const useSelection = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Usar en un lanzamiento" }),
  );

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Métricas > Mejores anuncios", () => {
  it("shows the tab and a grid card with ROAS and spend for the chosen range", async () => {
    const calls = useBackend();
    renderAt(`${TOP_ADS_PATH}&range=last_30d`);

    const card = (await screen.findByText("Anuncio Uno")).closest("li")!;
    expect(
      screen.getByRole("tab", { name: "Mejores anuncios", selected: true }),
    ).toBeTruthy();
    expect(within(card).getByText("3,20")).toBeTruthy();
    expect(within(card).getByText(/500,00/)).toBeTruthy();
    expect(lastCall(calls.topAds)).toMatchObject({ range: "last_30d" });
    expect(
      within(screen.getByText("Anuncio Cuatro").closest("li")!).getByText("—"),
    ).toBeTruthy();
  });

  it("filters the grid by the account filter", async () => {
    useBackend();
    renderAt(`${TOP_ADS_PATH}&adAccountIds=acc2`);

    await screen.findByText("Anuncio Cuatro");
    expect(screen.queryByText("Anuncio Uno")).toBeNull();
  });

  it("selecting 3 ads creates a top_ads draft with 3 clone items and opens it", async () => {
    const calls = useBackend();
    renderAt(TOP_ADS_PATH);

    await choose("Anuncio Uno");
    await choose("Anuncio Dos");
    await choose("Anuncio Tres");

    const bar = screen.getByRole("region", { name: "Selección de anuncios" });
    expect(within(bar).getByText("3 elegidos")).toBeTruthy();
    useSelection();

    await waitFor(() =>
      expect(screen.getByTestId("launch").textContent).toBe("l1"),
    );
    expect(calls.createLaunch).toHaveBeenCalledTimes(1);
    expect(calls.createLaunch.mock.lastCall?.[0]).toEqual({
      source: "top_ads",
      draft: {
        adAccountAssetId: "acc1",
        items: [
          {
            source: "clone",
            cloneAdId: "ad1",
            cloneStoryId: "story1",
            adName: "Anuncio Uno",
          },
          {
            source: "clone",
            cloneAdId: "ad2",
            cloneStoryId: "story2",
            adName: "Anuncio Dos",
          },
          { source: "clone", cloneAdId: "ad3", adName: "Anuncio Tres" },
        ],
      },
    });
  });

  it("sends the product filter in the draft", async () => {
    const calls = useBackend();
    renderAt(`${TOP_ADS_PATH}&productId=p1`);

    await choose("Anuncio Uno");
    useSelection();

    await waitFor(() => expect(calls.createLaunch).toHaveBeenCalled());
    expect(calls.createLaunch.mock.lastCall?.[0]).toMatchObject({
      draft: { productId: "p1" },
    });
  });

  it("locks ads from another account while a selection exists and unlocks when empty", async () => {
    useBackend();
    renderAt(TOP_ADS_PATH);

    const first = await choose("Anuncio Uno");
    const other = screen.getByRole("checkbox", {
      name: "Elegir Anuncio Cuatro",
    }) as HTMLInputElement;
    expect(other.disabled).toBe(true);
    expect(screen.getByText("Otra cuenta publicitaria")).toBeTruthy();

    fireEvent.click(first);
    expect(other.disabled).toBe(false);
    expect(
      screen.queryByRole("region", { name: "Selección de anuncios" }),
    ).toBeNull();
  });

  it("keeps the selection and shows an alert when the draft cannot be created", async () => {
    useBackend({ failCreate: true });
    renderAt(TOP_ADS_PATH);

    await choose("Anuncio Uno");
    useSelection();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No pudimos crear el lanzamiento. Probá de nuevo.",
    );
    expect(screen.getByText("1 elegido")).toBeTruthy();
    expect(screen.queryByTestId("launch")).toBeNull();
  });

  it("hides selection for viewers", async () => {
    useBackend({ role: "viewer" });
    renderAt(TOP_ADS_PATH);

    await screen.findByText("Anuncio Uno");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows an empty message", async () => {
    useBackend({ topAds: [] });
    renderAt(TOP_ADS_PATH);

    expect(
      await screen.findByText(
        "Todavía no hay anuncios con gasto suficiente para este rango.",
      ),
    ).toBeTruthy();
  });

  it("shows an error with retry", async () => {
    useBackend({ failTopAds: true });
    renderAt(TOP_ADS_PATH);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No pudimos cargar los mejores anuncios",
    );
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});

describe("Métricas > Qué gana", () => {
  it("loads the hook dimension by default and lists tags with ROAS and CPA", async () => {
    const calls = useBackend();
    renderAt(WINNING_PATH);

    const table = await screen.findByRole("table", {
      name: "Rendimiento por gancho. Rango: Últimos 7 días.",
    });
    await screen.findByText("pregunta");
    expect(lastCall(calls.winningTags)).toMatchObject({ dimension: "hook" });
    const pregunta = within(table).getByRole("row", { name: /pregunta/ });
    expect(within(pregunta).getByText("3,00")).toBeTruthy();
    expect(within(pregunta).getByText(/40,00/)).toBeTruthy();
    expect(within(pregunta).getByText("4")).toBeTruthy();
  });

  it("requests the chosen dimension and translates on-screen text values", async () => {
    const calls = useBackend({
      tags: [tag({ tag: "true" }), tag({ tag: "false" })],
    });
    renderAt(WINNING_PATH);

    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("radio", { name: "Texto en pantalla" }));

    await waitFor(() =>
      expect(lastCall(calls.winningTags)).toMatchObject({
        dimension: "onScreenText",
      }),
    );
    expect(await screen.findByText("Con texto")).toBeTruthy();
    expect(screen.getByText("Sin texto")).toBeTruthy();
  });

  it("draws bars scaled to the best ROAS and a break-even line from the product", async () => {
    useBackend();
    renderAt(`${WINNING_PATH}&productId=p1`);

    const table = await screen.findByRole("table");
    await screen.findByText("pregunta");
    const pregunta = within(table).getByRole("row", { name: /pregunta/ });
    const testimonio = within(table).getByRole("row", { name: /testimonio/ });

    expect(
      within(pregunta).getByText("ROAS 3,00, sobre el equilibrio de 1,67"),
    ).toBeTruthy();
    expect(
      within(testimonio).getByText("ROAS 1,20, bajo el equilibrio de 1,67"),
    ).toBeTruthy();
    expect(
      parseFloat(within(pregunta).getByTestId("roas-bar-fill").style.width),
    ).toBeCloseTo(100, 1);
    expect(
      parseFloat(within(testimonio).getByTestId("roas-bar-fill").style.width),
    ).toBeCloseTo((1.2 / 3) * 100, 1);
    expect(
      parseFloat(within(testimonio).getByTestId("break-even-line").style.left),
    ).toBeCloseTo((1.67 / 3) * 100, 1);
  });

  it("omits the break-even line when no product is chosen", async () => {
    useBackend();
    renderAt(WINNING_PATH);

    const table = await screen.findByRole("table");
    await screen.findByText("pregunta");
    expect(within(table).queryAllByTestId("break-even-line")).toHaveLength(0);
    expect(within(table).getAllByText(/sin equilibrio definido/)).toHaveLength(
      2,
    );
  });

  it("shows an empty message when no tag has data", async () => {
    useBackend({ tags: [] });
    renderAt(WINNING_PATH);

    expect(
      await screen.findByText(
        "Todavía no hay etiquetas con gasto en este rango.",
      ),
    ).toBeTruthy();
  });
});
