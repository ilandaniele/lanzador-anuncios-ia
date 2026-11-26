import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
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
import type { Me } from "../../src/shared/schemas/auth";
import type { LaunchDto } from "../../src/shared/schemas/launch";
import type { AssetDto } from "../../src/shared/schemas/meta-connections";
import { createQueryClient } from "../../src/web/lib/query-client";
import LanzadorPage from "../../src/web/pages/lanzador/LanzadorPage";
import { server } from "../helpers/msw/server";

const AUTOSAVE_WAIT_MS = 2500;

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
  asset({
    id: "a2",
    metaId: "act_2",
    name: "Cuenta sin pago",
    health: {
      accountStatus: 3,
      disableReason: 0,
      fundingOk: false,
      spendCapPct: null,
      checkedAt: "2026-01-01T00:00:00.000Z",
    },
  }),
  asset({ id: "pg1", kind: "page", metaId: "page_1", name: "Mi página" }),
  asset({
    id: "px1",
    kind: "pixel",
    metaId: "pixel_1",
    name: "Píxel tienda",
    parentMetaId: "act_1",
  }),
];

const launch = (draft: LaunchDto["draft"] = {}): LaunchDto => ({
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

const me: Me = {
  user: {
    id: "u1",
    email: "ana@example.com",
    name: "Ana",
    isSuperadmin: false,
  },
  workspaces: [
    {
      id: "w1",
      name: "Mi negocio",
      role: "editor",
      status: "active",
      billingBlocked: false,
    },
  ],
};

function useBackend(
  patchResponse: () => Response = () => HttpResponse.json({ launch: launch() }),
) {
  const calls = { create: vi.fn(), patch: vi.fn() };
  server.use(
    http.get("/api/me", () => HttpResponse.json(me)),
    http.get("/api/w/w1/meta/assets", () =>
      HttpResponse.json({ data: assets, nextCursor: null }),
    ),
    http.post("/api/w/w1/launches", async ({ request }) => {
      calls.create(await request.json());
      return HttpResponse.json({ launch: launch() }, { status: 201 });
    }),
    http.get("/api/w/w1/launches/l1", () =>
      HttpResponse.json({
        launch: launch(),
        items: [],
        checks: null,
        plan: null,
      }),
    ),
    http.patch("/api/w/w1/launches/l1", async ({ request }) => {
      calls.patch(await request.json());
      return patchResponse();
    }),
  );
  return calls;
}

function renderAt(path: string) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/w/:workspaceId/lanzador" element={<LanzadorPage />} />
          <Route
            path="/w/:workspaceId/lanzador/:launchId"
            element={<LanzadorPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function choose(label: RegExp, option: string) {
  fireEvent.click(await screen.findByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

const nextButton = () => screen.getByRole("button", { name: "Siguiente" });

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Lanzador > borrador", () => {
  it("creates the draft on entering and opens the wizard on its route", async () => {
    const calls = useBackend();
    renderAt("/w/w1/lanzador");

    await screen.findByRole("heading", { name: "Lanzador" });

    expect(calls.create).toHaveBeenCalledTimes(1);
    expect(calls.create).toHaveBeenCalledWith({ draft: {} });
    expect(screen.getByText("Guardado")).toBeTruthy();
  });
});

describe("Lanzador > autoguardado", () => {
  it("saves once, one second after the last change", async () => {
    const calls = useBackend();
    renderAt("/w/w1/lanzador/l1");

    await choose(/^Cuenta publicitaria/, "Cuenta sana");
    await choose(/^Página/, "Mi página");

    expect(screen.getByText("Guardando…")).toBeTruthy();
    expect(calls.patch).not.toHaveBeenCalled();

    await waitFor(() => expect(calls.patch).toHaveBeenCalledTimes(1), {
      timeout: AUTOSAVE_WAIT_MS,
    });
    expect(calls.patch).toHaveBeenCalledWith({
      draft: { adAccountAssetId: "a1", pageId: "page_1" },
    });
    await screen.findByText("Guardado");
  });

  it("shows Sin conexión when the save cannot reach the server", async () => {
    useBackend(() => HttpResponse.error());
    renderAt("/w/w1/lanzador/l1");

    await choose(/^Cuenta publicitaria/, "Cuenta sana");

    expect(
      await screen.findByText(
        "Sin conexión",
        {},
        { timeout: AUTOSAVE_WAIT_MS },
      ),
    ).toBeTruthy();
  });
});

describe("Lanzador > paso 1", () => {
  it("blocks Siguiente when the account has a payment problem", async () => {
    useBackend();
    renderAt("/w/w1/lanzador/l1");

    await choose(/^Cuenta publicitaria/, "Cuenta sin pago");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "problema de pago",
    );
    expect(nextButton().getAttribute("aria-disabled")).toBe("true");
  });

  it("enables Siguiente with a healthy account, page and pixel", async () => {
    useBackend();
    renderAt("/w/w1/lanzador/l1");

    await screen.findByRole("button", { name: "Siguiente" });
    expect(nextButton().getAttribute("aria-disabled")).toBe("true");
    await choose(/^Cuenta publicitaria/, "Cuenta sana");
    await choose(/^Página/, "Mi página");
    await choose(/^Píxel/, "Píxel tienda");

    expect(screen.getByText("Cuenta activa")).toBeTruthy();
    expect(nextButton().getAttribute("aria-disabled")).toBeNull();
  });
});
