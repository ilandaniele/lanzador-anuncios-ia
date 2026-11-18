import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { delay, http, HttpResponse, type HttpResponseResolver } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ErrorCode } from "../../src/shared/errors";
import type { AssetDto } from "../../src/shared/schemas/meta-connections";
import type {
  MetricsResponse,
  MetricsRowDto,
} from "../../src/shared/schemas/metrics";
import { createQueryClient } from "../../src/web/lib/query-client";
import MetricasPage from "../../src/web/pages/metricas/MetricasPage";
import { server } from "../helpers/msw/server";

const ACCOUNT: AssetDto = {
  id: "acc1",
  kind: "ad_account",
  metaId: "act_1",
  name: "Cuenta Uruguay",
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
};

const row = (overrides: Partial<MetricsRowDto>): MetricsRowDto => ({
  id: "c1",
  name: "Campaña Verano",
  level: "campaign",
  status: "ACTIVE",
  adAccountId: "acc1",
  currency: "USD",
  dailyBudgetMinor: 12000,
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

const metricsResponse = (data: MetricsRowDto[]): MetricsResponse => ({
  data,
  totals: [],
  previousTotals: [],
  updatedAt: "2026-11-17T17:35:00.000Z",
  stale: false,
  nextCursor: null,
});

const DEFAULT_ROWS = [
  row({}),
  row({ id: "c2", name: "Campaña Invierno", status: "PAUSED" }),
  row({ id: "c3", name: "Campaña Otoño", dailyBudgetMinor: undefined }),
];

const errorResponse = (code: ErrorCode, status: number) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "req_1" } },
    { status },
  );

const failAfterDelay: HttpResponseResolver = async () => {
  await delay(50);
  return errorResponse("INTERNAL", 500);
};

type Backend = {
  role?: "viewer" | "editor";
  rows?: () => MetricsRowDto[];
  status?: HttpResponseResolver;
  scale?: HttpResponseResolver;
  protect?: HttpResponseResolver;
};

function useBackend({
  role = "editor",
  rows = () => DEFAULT_ROWS,
  status = () => HttpResponse.json({ status: "PAUSED" }),
  scale = () =>
    HttpResponse.json({ previousBudgetMinor: 12000, newBudgetMinor: 15600 }),
  protect = () => new HttpResponse(null, { status: 204 }),
}: Backend = {}) {
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        user: { id: "u1", email: "ana@example.com", name: "Ana" },
        workspaces: [{ id: "w1", name: "Mi negocio", role, status: "active" }],
      }),
    ),
    http.get("/api/w/w1/meta/assets", () =>
      HttpResponse.json({ data: [ACCOUNT], nextCursor: null }),
    ),
    http.get("/api/w/w1/products", () =>
      HttpResponse.json({ data: [], nextCursor: null }),
    ),
    http.get("/api/w/w1/metrics", () =>
      HttpResponse.json(metricsResponse(rows())),
    ),
    http.post("/api/w/w1/meta/objects/:objectId/status", status),
    http.post("/api/w/w1/meta/campaigns/:campaignId/scale", scale),
    http.put("/api/w/w1/protected-campaigns/:campaignId", protect),
    http.delete("/api/w/w1/protected-campaigns/:campaignId", protect),
  );
}

function renderPage() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/w/w1/metricas"]}>
        <Routes>
          <Route path="/w/:workspaceId/metricas" element={<MetricasPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tableRow = async (name: string) =>
  within(await screen.findByRole("table")).findByRole("row", {
    name: new RegExp(name),
  });

const clickAction = async (rowName: string, action: string) =>
  fireEvent.click(
    await screen.findByRole("button", { name: `${action} ${rowName}` }),
  );

const lastCall = (spy: ReturnType<typeof vi.fn>) => spy.mock.lastCall?.[0];

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Métricas > acciones por fila", () => {
  it("hides the actions column for viewers", async () => {
    useBackend({ role: "viewer" });
    renderPage();

    await tableRow("Campaña Verano");
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pausar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Escalar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Proteger/ })).toBeNull();
  });

  it("only offers actions the object supports", async () => {
    useBackend();
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Pausar Campaña Verano" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Activar Campaña Invierno" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Escalar Campaña Verano" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Escalar Campaña Otoño" }),
    ).toBeNull();
  });

  it("pauses optimistically, confirms with a toast and undoes it", async () => {
    const spy = vi.fn();
    useBackend({
      status: async ({ request }) => {
        const body = (await request.json()) as { status: string };
        spy(body);
        await delay(50);
        return HttpResponse.json({ status: body.status });
      },
    });
    renderPage();

    await clickAction("Campaña Verano", "Pausar");

    expect(
      await within(await tableRow("Campaña Verano")).findByText("En pausa"),
    ).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toContain(
      "Campaña pausada",
    );
    expect(lastCall(spy)).toEqual({
      adAccountAssetId: "acc1",
      level: "campaign",
      status: "PAUSED",
      confirm: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    await waitFor(() =>
      expect(lastCall(spy)).toMatchObject({ status: "ACTIVE" }),
    );
    expect(
      within(await tableRow("Campaña Verano")).getByText("Activo"),
    ).toBeTruthy();
  });

  it("reverts the state and shows an error toast when the API fails", async () => {
    useBackend({ status: failAfterDelay });
    renderPage();

    await clickAction("Campaña Verano", "Pausar");
    expect(
      await within(await tableRow("Campaña Verano")).findByText("En pausa"),
    ).toBeTruthy();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No pudimos cambiar el estado");
    expect(
      within(await tableRow("Campaña Verano")).getByText("Activo"),
    ).toBeTruthy();
  });

  it("scales from a confirmation sheet showing the resulting amount", async () => {
    const spy = vi.fn();
    useBackend({
      scale: async ({ request }) => {
        spy(await request.json());
        return HttpResponse.json({
          previousBudgetMinor: 12000,
          newBudgetMinor: 15600,
        });
      },
    });
    renderPage();

    await clickAction("Campaña Verano", "Escalar");
    const dialog = await screen.findByRole("dialog", {
      name: "Escalar presupuesto de campaña",
    });
    const slider = within(dialog).getByRole("slider", {
      name: /Aumento del presupuesto/,
    });
    expect(slider.getAttribute("min")).toBe("1");
    expect(slider.getAttribute("max")).toBe("50");

    fireEvent.change(slider, { target: { value: "30" } });
    expect(within(dialog).getByText(/156,00 por día/)).toBeTruthy();
    expect(within(dialog).getByText(/120,00.*156,00.*\+30 %/)).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole("button", { name: /Escalar a .*156,00/ }),
    );

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        adAccountAssetId: "acc1",
        percent: 30,
        expectedCurrentBudgetMinor: 12000,
        confirm: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await screen.findByRole("status")).textContent).toContain(
      "Presupuesto escalado",
    );
  });

  it("refreshes and asks to confirm again when the budget changed", async () => {
    const spy = vi.fn();
    let budget = 12000;
    useBackend({
      rows: () => [row({ dailyBudgetMinor: budget })],
      scale: async ({ request }) => {
        const body = (await request.json()) as {
          expectedCurrentBudgetMinor: number;
        };
        spy(body);
        if (body.expectedCurrentBudgetMinor !== budget)
          return errorResponse("BUDGET_CHANGED", 409);
        return HttpResponse.json({
          previousBudgetMinor: budget,
          newBudgetMinor: 18000,
        });
      },
    });
    renderPage();

    await clickAction("Campaña Verano", "Escalar");
    const dialog = await screen.findByRole("dialog");
    budget = 15000;
    fireEvent.change(within(dialog).getByRole("slider"), {
      target: { value: "20" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Escalar a/ }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "presupuesto cambió",
    );
    await waitFor(() =>
      expect(within(dialog).getByText(/180,00 por día/)).toBeTruthy(),
    );
    expect(screen.getByRole("dialog")).toBe(dialog);

    fireEvent.click(within(dialog).getByRole("button", { name: /^Escalar a/ }));

    await waitFor(() =>
      expect(lastCall(spy)).toMatchObject({
        expectedCurrentBudgetMinor: 15000,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("protects a campaign optimistically and reverts on error", async () => {
    useBackend({ protect: failAfterDelay });
    renderPage();

    await clickAction("Campaña Verano", "Proteger");
    expect(
      await within(await tableRow("Campaña Verano")).findByText("Protegida"),
    ).toBeTruthy();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No pudimos cambiar la protección",
    );
    expect(
      within(await tableRow("Campaña Verano")).queryByText("Protegida"),
    ).toBeNull();
  });

  it("removes protection from a protected campaign", async () => {
    const spy = vi.fn();
    useBackend({
      rows: () => [row({ protected: true })],
      protect: () => {
        spy();
        return new HttpResponse(null, { status: 204 });
      },
    });
    renderPage();

    await clickAction("Campaña Verano", "Quitar protección");

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(
      within(await tableRow("Campaña Verano")).queryByText("Protegida"),
    ).toBeNull();
  });
});
