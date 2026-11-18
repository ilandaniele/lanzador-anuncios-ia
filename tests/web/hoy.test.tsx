import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
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
import type { LaunchListItemDto } from "../../src/shared/schemas/launch";
import type { TodayResponse } from "../../src/shared/schemas/today";
import { createQueryClient } from "../../src/web/lib/query-client";
import { useVisiblePolling } from "../../src/web/lib/use-server-polling";
import HoyPage from "../../src/web/pages/hoy/HoyPage";
import { server } from "../helpers/msw/server";
import {
  launchDto,
  progressDto,
  useLaunchBackend,
  useLaunchPost,
  WORKSPACE_ID,
} from "./helpers/launch-progress";

const TODAY_URL = `/api/w/${WORKSPACE_ID}/today`;
const POLL_MS = 20;
const SETTLE_MS = 120;
const VISIBLE_POLL_MS = 60_000;

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

function setTabVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}

const pausedLaunch: LaunchListItemDto = {
  id: "l1",
  status: "paused_verified",
  source: "manual",
  productName: "Combo",
  adAccountName: "Cuenta Uno",
  campaignName: "Campaña Combo",
  itemsTotal: 2,
  itemsDone: 2,
  itemsFailed: 0,
  metaCampaignUrl: null,
  createdBy: null,
  createdAt: "2026-01-01T12:00:00.000Z",
};

const todayDto = (overrides: Partial<TodayResponse> = {}): TodayResponse => ({
  accounts: [
    {
      id: "a1",
      name: "Cuenta Uno",
      currency: "USD",
      spendTodayMinor: 82000,
      spendYesterdayMinor: 75000,
      purchases: 4,
      roas: 2.5,
      cpaMinor: 2000,
    },
    {
      id: "a2",
      name: "Cuenta Dos",
      currency: "USD",
      spendTodayMinor: 31000,
      spendYesterdayMinor: 32000,
      purchases: 1,
      roas: null,
      cpaMinor: null,
    },
  ],
  alerts: [
    {
      kind: "token_expiring",
      severity: "warn",
      text: "El token vence pronto",
      objectId: "c1",
    },
    {
      kind: "reconnect_required",
      severity: "error",
      text: "Meta pide reconectar",
      objectId: "c1",
    },
  ],
  proposals: {
    pendingCount: 1,
    top: [
      {
        id: "pr1",
        runId: "run1",
        ruleType: "pause_no_sales",
        action: "pause",
        adAccountId: "a1",
        level: "campaign",
        objectId: "camp1",
        objectName: "Campaña floja",
        evidence: {},
        currentBudgetMinor: null,
        proposedBudgetMinor: null,
        percent: null,
        explanation: "Gastó el doble del CPA objetivo sin vender",
        status: "pending",
        resultMessage: null,
        launchId: null,
        decidedAt: null,
        expiresAt: "2026-01-02T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  },
  launches: [pausedLaunch],
  updatedAt: "2026-01-01T14:32:00.000Z",
  stale: false,
  ...overrides,
});

function useTodayBackend(body: () => TodayResponse = todayDto) {
  const calls = vi.fn();
  server.use(
    http.get(TODAY_URL, () => {
      calls();
      return HttpResponse.json(body());
    }),
  );
  return calls;
}

function renderHoy(client: QueryClient = createQueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/w/${WORKSPACE_ID}/hoy`]}>
        <Routes>
          <Route path="/w/:workspaceId/hoy" element={<HoyPage />} />
          <Route
            path="/w/:workspaceId/ajustes/conexiones"
            element={<h1>Pantalla de conexiones</h1>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  setTabVisibility("visible");
});
afterAll(() => server.disable());

describe("HoyPage", () => {
  it("shows a skeleton while loading, then the update time", async () => {
    useTodayBackend();
    renderHoy();

    expect(screen.getByText("Cargando")).toBeTruthy();
    expect(await screen.findByText(/Datos de las/)).toBeTruthy();
    expect(screen.queryByText("Cargando")).toBeNull();
  });

  it("sums the spend and shows a delta against yesterday", async () => {
    useTodayBackend();
    renderHoy();

    const total = await screen.findByRole("region", { name: "Gasto de hoy" });

    expect(within(total).getByText(/1\.130,00/)).toBeTruthy();
    expect(within(total).getByText("vs ayer")).toBeTruthy();
    expect(within(total).getByText(/sube 5,6 %/)).toBeTruthy();
  });

  it("lists one card per account", async () => {
    useTodayBackend();
    renderHoy();

    const accounts = await screen.findByRole("region", { name: "Cuentas" });

    expect(within(accounts).getAllByRole("listitem")).toHaveLength(2);
    expect(within(accounts).getByText("Cuenta Dos")).toBeTruthy();
  });

  it("orders alerts by severity and sends reconnect to Conexiones", async () => {
    useTodayBackend();
    renderHoy();

    const alerts = await screen.findByRole("region", { name: "Alertas" });
    const [first] = within(alerts).getAllByRole("listitem");
    expect(first?.textContent).toContain("Meta pide reconectar");

    const reconnect = within(first as HTMLElement).getByRole("link", {
      name: "Reconectar Meta",
    });
    expect(reconnect.getAttribute("href")).toBe(
      `/w/${WORKSPACE_ID}/ajustes/conexiones`,
    );
    fireEvent.click(reconnect);

    expect(await screen.findByText("Pantalla de conexiones")).toBeTruthy();
  });

  it("hides the alerts block when there are none", async () => {
    useTodayBackend(() => todayDto({ alerts: [] }));
    renderHoy();

    await screen.findByRole("region", { name: "Cuentas" });

    expect(screen.queryByRole("region", { name: "Alertas" })).toBeNull();
  });

  it("lists pending proposals with a link to Piloto", async () => {
    useTodayBackend();
    renderHoy();

    const proposals = await screen.findByRole("region", {
      name: /Propuestas del piloto/,
    });

    expect(within(proposals).getByText(/Pausar Campaña floja/)).toBeTruthy();
    expect(
      within(proposals)
        .getByRole("link", { name: "Ver todas en Piloto" })
        .getAttribute("href"),
    ).toBe(`/w/${WORKSPACE_ID}/piloto`);
  });

  it("shows the empty state with a link to the launcher", async () => {
    useTodayBackend(() =>
      todayDto({
        accounts: [],
        alerts: [],
        launches: [],
        proposals: { pendingCount: 0, top: [] },
      }),
    );
    renderHoy();

    const link = await screen.findByRole("link", { name: "Nuevo lanzamiento" });

    expect(link.getAttribute("href")).toBe(`/w/${WORKSPACE_ID}/lanzador`);
  });

  it("shows an error with retry when the request fails", async () => {
    server.use(
      http.get(TODAY_URL, () =>
        HttpResponse.json(
          { error: { code: "FORBIDDEN", message: "no", requestId: "r1" } },
          { status: 403 },
        ),
      ),
    );
    renderHoy();

    expect(await screen.findByText("No pudimos cargar Hoy.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});

describe("HoyPage > Activar", () => {
  it("shows the receipt with ads and budget, then sends confirm:true", async () => {
    useTodayBackend();
    useLaunchBackend(() => progressDto(), launchDto());
    const activated = useLaunchPost("activate", 202);
    renderHoy();

    fireEvent.click(
      await screen.findByRole("button", { name: "Activar Combo" }),
    );
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(/20,00/)).toBeTruthy();
    expect(within(dialog).getByText("Anuncios").nextSibling?.textContent).toBe(
      "2",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Activar" }));

    await waitFor(() =>
      expect(activated).toHaveBeenCalledWith({ confirm: true }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers Activar only on paused launches", async () => {
    useTodayBackend(() =>
      todayDto({
        launches: [{ ...pausedLaunch, status: "active" }],
      }),
    );
    renderHoy();

    await screen.findByRole("region", { name: "Últimos lanzamientos" });

    expect(screen.queryByRole("button", { name: /^Activar/ })).toBeNull();
  });
});

describe("HoyPage > Actualizar", () => {
  it("posts the refresh and disables the button with a countdown", async () => {
    useTodayBackend();
    const refreshed = vi.fn();
    server.use(
      http.post(`/api/w/${WORKSPACE_ID}/metrics/refresh`, () => {
        refreshed();
        return HttpResponse.json({ updatedAt: "2026-01-01T14:40:00.000Z" });
      }),
    );
    renderHoy();

    fireEvent.click(await screen.findByRole("button", { name: "Actualizar" }));

    const waiting = await screen.findByRole("button", {
      name: "Actualizar en 1:00",
    });
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(waiting.hasAttribute("disabled")).toBe(true);
  });
});

describe("HoyPage > polling", () => {
  it("makes no request on the 60 s tick while the tab is hidden", async () => {
    const calls = useTodayBackend();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    renderHoy();
    await screen.findByText(/Datos de las/);

    act(() => setTabVisibility("hidden"));
    await vi.advanceTimersByTimeAsync(VISIBLE_POLL_MS * 3);
    expect(calls).toHaveBeenCalledTimes(1);

    act(() => setTabVisibility("visible"));
    await vi.advanceTimersByTimeAsync(VISIBLE_POLL_MS);
    await waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  });
});

describe("useVisiblePolling", () => {
  const wrapperFor =
    (client: QueryClient) =>
    ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

  function pollWith(client: QueryClient, intervalMs = POLL_MS) {
    const fetcher = vi.fn(async () => "data");
    renderHook(() => useVisiblePolling(["poll"], fetcher, intervalMs), {
      wrapper: wrapperFor(client),
    });
    return fetcher;
  }

  it("refetches on the interval while the tab is visible", async () => {
    const fetcher = pollWith(new QueryClient());

    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(2));
  });

  it("makes no request while the tab is hidden", async () => {
    const fetcher = pollWith(new QueryClient());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    act(() => setTabVisibility("hidden"));
    const before = fetcher.mock.calls.length;
    await settle();

    expect(fetcher.mock.calls.length).toBe(before);
  });

  it("refetches when the tab becomes visible again", async () => {
    const fetcher = pollWith(new QueryClient(), VISIBLE_POLL_MS);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    act(() => setTabVisibility("hidden"));

    act(() => setTabVisibility("visible"));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
