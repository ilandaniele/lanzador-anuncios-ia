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
import type { ErrorCode } from "../../src/shared/errors";
import type { Me } from "../../src/shared/schemas/auth";
import type {
  AssetDto,
  ConnectionDto,
} from "../../src/shared/schemas/meta-connections";
import type { ProductDto } from "../../src/shared/schemas/products";
import { redirectToExternal } from "../../src/web/features/meta/external-redirect";
import { createQueryClient } from "../../src/web/lib/query-client";
import OnboardingPage from "../../src/web/pages/onboarding/OnboardingPage";
import { server } from "../helpers/msw/server";

vi.mock("../../src/web/features/meta/external-redirect", () => ({
  redirectToExternal: vi.fn(),
}));

const user: Me["user"] = {
  id: "u1",
  email: "ana@example.com",
  name: "Ana",
  isSuperadmin: false,
};

const connection: ConnectionDto = {
  id: "c1",
  businessId: "b1",
  businessName: "Mi Negocio SA",
  status: "active",
  scopes: [],
  connectedBy: "u1",
  connectedAt: "2026-01-01T00:00:00.000Z",
  lastErrorCode: null,
  tokenExpiresAt: "2099-01-01T00:00:00.000Z",
  creativeCount: 0,
};

const account: AssetDto = {
  id: "a1",
  kind: "ad_account",
  metaId: "meta_a1",
  name: "Cuenta Uno",
  parentMetaId: null,
  currency: null,
  enabled: false,
  health: {
    accountStatus: null,
    disableReason: null,
    fundingOk: null,
    spendCapPct: null,
    checkedAt: null,
  },
};

const product: ProductDto = {
  id: "p1",
  name: "Buzo",
  landingUrl: "https://tienda.example.com/buzo",
  headline: "Buzo canguro",
  primaryText: "Abrigate con estilo",
  cta: "SHOP_NOW",
  landingStatus: "unchecked",
  breakEvenRoas: null,
  archived: false,
  description: null,
  utm: null,
  priceMinor: null,
  costMinor: null,
  currency: "USD",
  profitPerSaleMinor: null,
  landingHttpStatus: null,
  landingError: null,
  landingCheckedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const fail = (code: ErrorCode, status: number) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "req_1" } },
    { status },
  );

type BackendState = { hasWorkspace: boolean; metaConnected: boolean };

function useBackend(initial: Partial<BackendState> = {}) {
  const state: BackendState = {
    hasWorkspace: false,
    metaConnected: false,
    ...initial,
  };
  const calls = {
    createWorkspace: vi.fn(),
    connect: vi.fn(),
    patchAssets: vi.fn(),
    createProduct: vi.fn(),
  };
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        user,
        workspaces: state.hasWorkspace
          ? [
              {
                id: "w1",
                name: "Mi negocio",
                role: "owner",
                status: "active",
                billingBlocked: false,
              },
            ]
          : [],
      } satisfies Me),
    ),
    http.post("/api/workspaces", async ({ request }) => {
      calls.createWorkspace(await request.json());
      state.hasWorkspace = true;
      return HttpResponse.json(
        {
          workspace: {
            id: "w1",
            name: "Mi negocio",
            planId: "free",
            status: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          role: "owner",
        },
        { status: 201 },
      );
    }),
    http.get("/api/w/w1/meta/connections", () =>
      HttpResponse.json({ data: state.metaConnected ? [connection] : [] }),
    ),
    http.post("/api/w/w1/meta/connect", () => {
      calls.connect();
      return HttpResponse.json({
        authorizeUrl: "https://www.facebook.com/dialog/oauth?state=s",
      });
    }),
    http.get("/api/w/w1/meta/assets", () =>
      HttpResponse.json({ data: [account], nextCursor: null }),
    ),
    http.patch("/api/w/w1/meta/assets", async ({ request }) => {
      calls.patchAssets(await request.json());
      return HttpResponse.json({});
    }),
    http.post("/api/w/w1/products", async ({ request }) => {
      calls.createProduct(await request.json());
      return HttpResponse.json({ product }, { status: 201 });
    }),
  );
  return { state, calls };
}

function renderOnboarding() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/w/:workspaceId/hoy" element={<h1>Pantalla Hoy</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const currentStep = () =>
  document.querySelector("[aria-current=step]")?.textContent;

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.mocked(redirectToExternal).mockClear();
});
afterAll(() => server.disable());

describe("Onboarding: 4 pasos", () => {
  it("walks name, Conectar Meta, Elegir activos and primer producto", async () => {
    const { state, calls } = useBackend();
    renderOnboarding();

    await screen.findByLabelText(/^Nombre del workspace/);
    expect(currentStep()).toBe("1. Nombre");
    fill(/^Nombre del workspace/, "  Mi negocio  ");
    fireEvent.click(screen.getByRole("button", { name: "Crear workspace" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Conectar Meta" }),
    );
    expect(calls.createWorkspace).toHaveBeenCalledWith({ name: "Mi negocio" });
    expect(currentStep()).toBe("2. Conectar Meta");
    await waitFor(() =>
      expect(redirectToExternal).toHaveBeenCalledWith(
        "https://www.facebook.com/dialog/oauth?state=s",
      ),
    );

    cleanup();
    state.metaConnected = true;
    renderOnboarding();

    fireEvent.click(
      await screen.findByRole("checkbox", { name: /Cuenta Uno/ }),
    );
    expect(currentStep()).toBe("3. Elegir activos");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(calls.patchAssets).toHaveBeenCalledTimes(1));
    expect(calls.patchAssets).toHaveBeenCalledWith({
      changes: [{ id: "a1", enabled: true }],
    });

    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    await screen.findByText("Cargá tu primer producto");
    expect(currentStep()).toBe("4. Primer producto");
    fill(/^Nombre/, "Buzo");
    fill(/^URL de la landing/, "https://tienda.example.com/buzo");
    fill(/^Texto principal/, "Abrigate con estilo");
    fill(/^Título/, "Buzo canguro");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(calls.createProduct).toHaveBeenCalledTimes(1));
    await screen.findByRole("heading", { name: "Pantalla Hoy" });
  });

  it("lets the user skip the first product", async () => {
    const { calls } = useBackend({ hasWorkspace: true, metaConnected: true });
    renderOnboarding();

    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Saltar" }));

    await screen.findByRole("heading", { name: "Pantalla Hoy" });
    expect(calls.createProduct).not.toHaveBeenCalled();
  });

  it("asks for a name before creating the workspace", async () => {
    const { calls } = useBackend();
    renderOnboarding();

    fireEvent.click(
      await screen.findByRole("button", { name: "Crear workspace" }),
    );

    expect(await screen.findByText("Ingresá un nombre")).toBeTruthy();
    expect(calls.createWorkspace).not.toHaveBeenCalled();
  });

  it("explains the workspace limit", async () => {
    useBackend();
    server.use(
      http.post("/api/workspaces", () => fail("WORKSPACE_LIMIT", 422)),
    );
    renderOnboarding();

    fill(/^Nombre del workspace/, "Otro");
    fireEvent.click(
      await screen.findByRole("button", { name: "Crear workspace" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "máximo de workspaces",
    );
  });
});
