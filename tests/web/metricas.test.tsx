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
import type { AssetDto } from "../../src/shared/schemas/meta-connections";
import type {
  MetricsResponse,
  MetricsRowDto,
  MetricsTotalsDto,
} from "../../src/shared/schemas/metrics";
import type { ProductListItemDto } from "../../src/shared/schemas/products";
import { computeDelta } from "../../src/web/features/metrics/compute-delta";
import { createQueryClient } from "../../src/web/lib/query-client";
import MetricasPage from "../../src/web/pages/metricas/MetricasPage";
import { server } from "../helpers/msw/server";

const CAPTION_DEFAULT =
  "Rendimiento por campañas. Rango: Últimos 7 días. Cuenta: Todas las cuentas. Producto: Todos los productos.";

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

const product = (
  id: string,
  name: string,
  breakEvenRoas: number | null,
): ProductListItemDto => ({
  id,
  name,
  landingUrl: "https://tienda.example.com",
  headline: name,
  primaryText: name,
  cta: "SHOP_NOW",
  landingStatus: "ok",
  breakEvenRoas,
  archived: false,
});

const row = (overrides: Partial<MetricsRowDto>): MetricsRowDto => ({
  id: "c1",
  name: "Campaña Verano",
  level: "campaign",
  status: "ACTIVE",
  adAccountId: "acc1",
  currency: "USD",
  productId: "p1",
  spendMinor: 60000,
  purchases: 12,
  purchaseValueMinor: 147000,
  roas: 2.45,
  cpaMinor: 5000,
  ctr: 1.5,
  cpmMinor: 900,
  protected: false,
  ...overrides,
});

const totals = (overrides: Partial<MetricsTotalsDto>): MetricsTotalsDto => ({
  currency: "USD",
  impressions: 100000,
  clicks: 1500,
  spendMinor: 100000,
  purchases: 20,
  purchaseValueMinor: 250000,
  roas: 2.5,
  cpaMinor: 5000,
  ctr: 1.5,
  cpmMinor: 900,
  ...overrides,
});

const metricsResponse = (
  overrides: Partial<MetricsResponse> = {},
): MetricsResponse => ({
  data: [
    row({ protected: true }),
    row({
      id: "c2",
      name: "Campaña Invierno",
      status: "PAUSED",
      productId: "p2",
      roas: 1.9,
    }),
    row({ id: "c3", name: "Campaña Otoño", roas: 1.2 }),
  ],
  totals: [totals({})],
  previousTotals: [
    totals({
      spendMinor: 80000,
      purchaseValueMinor: 200000,
      cpaMinor: 6250,
    }),
  ],
  updatedAt: "2026-11-17T17:35:00.000Z",
  stale: false,
  nextCursor: null,
  ...overrides,
});

function useBackend({
  response = metricsResponse(),
  accounts = [
    account("acc1", "Cuenta Uruguay"),
    account("acc2", "Cuenta Chile"),
  ],
  failMetrics = false,
}: {
  response?: MetricsResponse;
  accounts?: AssetDto[];
  failMetrics?: boolean;
} = {}) {
  const calls = { metrics: vi.fn() };
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        user: { id: "u1", email: "ana@example.com", name: "Ana" },
        workspaces: [
          {
            id: "w1",
            name: "Mi negocio",
            role: "viewer",
            status: "active",
            billingBlocked: false,
          },
        ],
      }),
    ),
    http.get("/api/w/w1/meta/assets", () =>
      HttpResponse.json({ data: accounts, nextCursor: null }),
    ),
    http.get("/api/w/w1/products", () =>
      HttpResponse.json({
        data: [
          product("p1", "Zapatillas", 1.67),
          product("p2", "Remera", null),
        ],
        nextCursor: null,
      }),
    ),
    http.get("/api/w/w1/metrics", ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams);
      calls.metrics(params);
      if (failMetrics)
        return HttpResponse.json(
          {
            error: {
              code: "RANGE_INVALID",
              message: "RANGE_INVALID",
              requestId: "req_1",
            },
          },
          { status: 422 },
        );
      if (params.cursor)
        return HttpResponse.json(
          metricsResponse({
            data: [row({ id: "c9", name: "Campaña Primavera" })],
          }),
        );
      return HttpResponse.json(response);
    }),
  );
  return calls;
}

function SearchProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderAt(path: string) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/w/:workspaceId/metricas"
            element={
              <>
                <MetricasPage />
                <SearchProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const currentSearch = () =>
  new URLSearchParams(screen.getByTestId("search").textContent ?? "");

const lastMetricsCall = (calls: ReturnType<typeof useBackend>) =>
  calls.metrics.mock.lastCall?.[0] as Record<string, string>;

const pickOption = async (combobox: string, option: string) => {
  fireEvent.click(screen.getByRole("combobox", { name: combobox }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
};

const loadedRows = () => screen.findByText("Campaña Verano");

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => server.disable());

describe("Métricas > Rendimiento", () => {
  it("renders the performance tab with rows, status, lock and a filter caption", async () => {
    useBackend();
    renderAt("/w/w1/metricas");

    const table = await screen.findByRole("table", { name: CAPTION_DEFAULT });
    await loadedRows();
    const verano = within(table).getByRole("row", { name: /Campaña Verano/ });
    expect(within(verano).getByText("Activo")).toBeTruthy();
    expect(within(verano).getByText("Protegida")).toBeTruthy();
    expect(within(verano).getByText(/600,00/)).toBeTruthy();
    expect(
      within(table).getByRole("row", { name: /Campaña Invierno/ }),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("tablist", { name: "Secciones de métricas" }),
      ).getByRole("tab", { name: "Rendimiento", selected: true }),
    ).toBeTruthy();
  });

  it("shows five KPIs with semantic deltas and the update time", async () => {
    useBackend();
    renderAt("/w/w1/metricas");
    await loadedRows();
    const summary = screen.getByRole("region", { name: "Resumen" });

    const terms = within(summary)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(terms).toEqual(["Gasto", "Compras", "Valor", "ROAS", "CPA"]);
    expect(
      within(summary).getByText("sube 25 % contra el período anterior"),
    ).toBeTruthy();
    expect(
      within(summary).getByText("sube 25 % contra el período anterior, mejor"),
    ).toBeTruthy();
    expect(
      within(summary).getByText("baja 20 % contra el período anterior, mejor"),
    ).toBeTruthy();
    expect(within(summary).getAllByText("sin cambio")).toHaveLength(2);
    expect(within(summary).getByText(/Actualizado \d{2}:\d{2}/)).toBeTruthy();
  });

  it("draws the break-even bar and describes ROAS against the break-even", async () => {
    useBackend();
    renderAt("/w/w1/metricas");
    const table = await screen.findByRole("table");
    await loadedRows();

    const verano = within(table).getByRole("row", { name: /Campaña Verano/ });
    expect(
      within(verano).getByText("ROAS 2,45, sobre el equilibrio de 1,67"),
    ).toBeTruthy();
    expect(within(verano).getByText("sobre eq.")).toBeTruthy();
    const otono = within(table).getByRole("row", { name: /Campaña Otoño/ });
    expect(
      within(otono).getByText("ROAS 1,20, bajo el equilibrio de 1,67"),
    ).toBeTruthy();
    expect(within(otono).getByText("bajo eq.")).toBeTruthy();
    const invierno = within(table).getByRole("row", {
      name: /Campaña Invierno/,
    });
    expect(
      within(invierno).getByText("ROAS 1,90, sin equilibrio definido"),
    ).toBeTruthy();
    expect(
      parseFloat(within(verano).getByTestId("break-even-fill").style.width),
    ).toBeCloseTo((2.45 / (3 * 1.67)) * 100, 1);
  });

  it("reads every filter from the URL on load", async () => {
    const calls = useBackend();
    renderAt(
      "/w/w1/metricas?level=adset&range=last_30d&adAccountIds=acc2&productId=p1&sort=roas:asc",
    );

    await screen.findByRole("table", {
      name: "Rendimiento por conjuntos. Rango: Últimos 30 días. Cuenta: Cuenta Chile. Producto: Zapatillas.",
    });
    expect(lastMetricsCall(calls)).toMatchObject({
      level: "adset",
      range: "last_30d",
      adAccountIds: "acc2",
      productId: "p1",
      sort: "roas:asc",
      limit: "50",
    });
    expect(
      (screen.getByRole("radio", { name: "Conjunto" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      screen
        .getByRole("columnheader", { name: /ROAS/ })
        .getAttribute("aria-sort"),
    ).toBe("ascending");
  });

  it("changing the level updates the URL, the query and the caption", async () => {
    const calls = useBackend();
    renderAt("/w/w1/metricas");
    await screen.findByRole("table", { name: CAPTION_DEFAULT });

    fireEvent.click(screen.getByRole("radio", { name: "Anuncio" }));

    await screen.findByRole("table", {
      name: /^Rendimiento por anuncios\./,
    });
    expect(currentSearch().get("level")).toBe("ad");
    expect(lastMetricsCall(calls).level).toBe("ad");
  });

  it("changing the range updates the URL and the query", async () => {
    const calls = useBackend();
    renderAt("/w/w1/metricas");
    await screen.findByRole("table", { name: CAPTION_DEFAULT });

    fireEvent.change(screen.getByLabelText("Rango"), {
      target: { value: "today" },
    });

    await screen.findByRole("table", { name: /Rango: Hoy\./ });
    expect(currentSearch().get("range")).toBe("today");
    expect(lastMetricsCall(calls).range).toBe("today");
  });

  it("changing account and product updates the URL and the query", async () => {
    const calls = useBackend();
    renderAt("/w/w1/metricas");
    await screen.findByRole("table", { name: CAPTION_DEFAULT });

    await pickOption("Cuenta", "Cuenta Uruguay");
    await waitFor(() =>
      expect(lastMetricsCall(calls).adAccountIds).toBe("acc1"),
    );
    await pickOption("Producto", "Remera");

    await screen.findByRole("table", {
      name: /Cuenta: Cuenta Uruguay\. Producto: Remera\./,
    });
    expect(currentSearch().get("adAccountIds")).toBe("acc1");
    expect(currentSearch().get("productId")).toBe("p2");
    expect(lastMetricsCall(calls)).toMatchObject({
      adAccountIds: "acc1",
      productId: "p2",
    });
  });

  it("custom range waits for both dates, queries them and shows the comparison chip", async () => {
    const calls = useBackend();
    renderAt("/w/w1/metricas");
    await screen.findByRole("table", { name: CAPTION_DEFAULT });
    const before = calls.metrics.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Rango"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2025-03-08" },
    });
    expect(
      screen.getByText("Elegí desde y hasta para ver las métricas."),
    ).toBeTruthy();
    expect(calls.metrics.mock.calls.length).toBe(before);

    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2025-03-14" },
    });

    await screen.findByRole("table", {
      name: /Rango: Personalizado, del 08\/03\/2025 al 14\/03\/2025\./,
    });
    expect(currentSearch().get("range")).toBe("custom");
    expect(currentSearch().get("from")).toBe("2025-03-08");
    expect(currentSearch().get("to")).toBe("2025-03-14");
    expect(lastMetricsCall(calls)).toMatchObject({
      range: "custom",
      from: "2025-03-08",
      to: "2025-03-14",
    });
    expect(screen.getByText("Comparando con 1/3–7/3")).toBeTruthy();
  });

  it("sorting by a header updates the URL and the query, and a third click goes back to spend", async () => {
    const calls = useBackend();
    renderAt("/w/w1/metricas");
    await screen.findByRole("table", { name: CAPTION_DEFAULT });

    fireEvent.click(screen.getByRole("button", { name: /ROAS/ }));
    await waitFor(() => expect(lastMetricsCall(calls).sort).toBe("roas:asc"));
    expect(currentSearch().get("sort")).toBe("roas:asc");

    fireEvent.click(screen.getByRole("button", { name: /ROAS/ }));
    await waitFor(() => expect(lastMetricsCall(calls).sort).toBe("roas:desc"));

    fireEvent.click(screen.getByRole("button", { name: /ROAS/ }));
    await waitFor(() => expect(currentSearch().has("sort")).toBe(false));
    expect(
      screen
        .getByRole("columnheader", { name: /Gasto/ })
        .getAttribute("aria-sort"),
    ).toBe("descending");
  });

  it("keeps the export link in sync with the filters", async () => {
    useBackend();
    renderAt("/w/w1/metricas?level=ad");
    await screen.findByRole("table");

    const link = screen.getByRole("link", { name: "Exportar CSV" });
    const url = new URL(link.getAttribute("href") ?? "", "http://app.test");
    expect(url.pathname).toBe("/api/w/w1/metrics/export.csv");
    expect(url.searchParams.get("level")).toBe("ad");
    expect(url.searchParams.has("limit")).toBe(false);

    fireEvent.click(screen.getByRole("radio", { name: "Campaña" }));
    await waitFor(() =>
      expect(
        new URL(
          screen
            .getByRole("link", { name: "Exportar CSV" })
            .getAttribute("href") ?? "",
          "http://app.test",
        ).searchParams.has("level"),
      ).toBe(false),
    );
  });

  it("loads the next page with the cursor", async () => {
    const calls = useBackend({
      response: metricsResponse({ nextCursor: "cursor-1" }),
    });
    renderAt("/w/w1/metricas");
    await loadedRows();

    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));

    await screen.findByText("Campaña Primavera");
    expect(lastMetricsCall(calls).cursor).toBe("cursor-1");
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  it("shows the API error with a retry action", async () => {
    useBackend({ failMetrics: true });
    renderAt("/w/w1/metricas");

    expect(
      await screen.findByText("El rango elegido no es válido."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });

  it("asks to connect Meta when there are no enabled ad accounts", async () => {
    useBackend({ accounts: [] });
    renderAt("/w/w1/metricas");

    expect(
      await screen.findByRole("button", { name: "Conectar Meta" }),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("switches to a list layout on mobile", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    useBackend();
    renderAt("/w/w1/metricas");

    const list = await screen.findByRole("list", { name: CAPTION_DEFAULT });
    expect(screen.queryByRole("table")).toBeNull();
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText("Campaña Verano")).toBeTruthy();
    expect(within(items[0]!).getByText(/600,00/)).toBeTruthy();
  });
});

describe("computeDelta", () => {
  it("marks a rise as good for higher-is-better metrics and bad for lower-is-better ones", () => {
    expect(computeDelta("higherIsBetter", 125, 100)).toMatchObject({
      direction: "up",
      tone: "gain",
      percent: 25,
    });
    expect(computeDelta("lowerIsBetter", 125, 100)).toMatchObject({
      direction: "up",
      tone: "loss",
    });
    expect(computeDelta("lowerIsBetter", 80, 100)).toMatchObject({
      direction: "down",
      tone: "gain",
    });
    expect(computeDelta("higherIsBetter", 80, 100)).toMatchObject({
      direction: "down",
      tone: "loss",
    });
  });

  it("keeps spend neutral", () => {
    expect(computeDelta("neutral", 120, 100).tone).toBe("neutral");
    expect(computeDelta("neutral", 80, 100).tone).toBe("neutral");
  });

  it("reports no change under 0,5 % and no data without a previous value", () => {
    expect(computeDelta("higherIsBetter", 100.4, 100).direction).toBe("same");
    expect(computeDelta("higherIsBetter", 100, 0).direction).toBe("none");
    expect(computeDelta("higherIsBetter", null, 100).direction).toBe("none");
    expect(computeDelta("higherIsBetter", 100, null).direction).toBe("none");
  });
});
