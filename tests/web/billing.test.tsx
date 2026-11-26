import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
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
  BillingOverview,
  BillingPlan,
} from "../../src/shared/schemas/billing";
import { useMe } from "../../src/web/features/auth/use-me";
import { redirectToExternal } from "../../src/web/features/meta/external-redirect";
import { apiFetch } from "../../src/web/lib/api";
import { createQueryClient } from "../../src/web/lib/query-client";
import { appRoutes } from "../../src/web/router";
import { server } from "../helpers/msw/server";

vi.mock("../../src/web/features/meta/external-redirect", () => ({
  redirectToExternal: vi.fn(),
}));

type Role = Me["workspaces"][number]["role"];

const DAY_MS = 24 * 60 * 60 * 1000;
const INIT_POINT = "https://www.mercadopago.com.ar/subscriptions/checkout?id=1";
const FACTURACION_PATH = "/w/w1/ajustes/facturacion";
const SETTINGS_NAV = "Secciones de ajustes";
const PAYWALL_TITLE = "Este espacio necesita una suscripción";

const plans: BillingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthlyMinor: 3000000,
    currency: "ARS",
    maxMembers: 3,
    maxAdAccounts: 2,
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthlyMinor: 8000000,
    currency: "ARS",
    maxMembers: 10,
    maxAdAccounts: 10,
  },
];

const trialOverview = (): BillingOverview => ({
  planId: "starter",
  planName: "Starter",
  isFree: false,
  blocked: false,
  trialEndsAt: new Date(Date.now() + 5 * DAY_MS - 1000).toISOString(),
  subscription: null,
  plans,
});

const authorizedOverview = (): BillingOverview => ({
  ...trialOverview(),
  trialEndsAt: null,
  subscription: {
    planId: "starter",
    status: "authorized",
    paidUntil: "2030-03-15T12:00:00.000Z",
  },
});

const betaOverview = (): BillingOverview => ({
  planId: "beta",
  planName: "Beta",
  isFree: true,
  blocked: false,
  trialEndsAt: null,
  subscription: null,
  plans,
});

const meAs = (role: Role, billingBlocked: boolean): Me => ({
  user: {
    id: "u1",
    email: "ana@example.com",
    name: "Ana",
    isSuperadmin: false,
  },
  workspaces: [
    { id: "w1", name: "Mi negocio", role, status: "active", billingBlocked },
  ],
});

const fail = (code: ErrorCode, status: number) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "req_1" } },
    { status },
  );

type BackendOptions = {
  role?: Role;
  blocked?: boolean;
  overview?: () => BillingOverview;
};

function useBackend({
  role = "owner",
  blocked = false,
  overview = trialOverview,
}: BackendOptions = {}) {
  const calls = {
    billing: vi.fn(),
    me: vi.fn(),
    subscribe: vi.fn(),
    cancel: vi.fn(),
  };
  server.use(
    http.get("/api/me", () => {
      calls.me();
      return HttpResponse.json(meAs(role, blocked));
    }),
    http.get("/api/w/w1/billing", () => {
      calls.billing();
      return HttpResponse.json(overview());
    }),
    http.post("/api/w/w1/billing/subscribe", async ({ request }) => {
      calls.subscribe(await request.json());
      return HttpResponse.json({ initPoint: INIT_POINT }, { status: 201 });
    }),
    http.post("/api/w/w1/billing/cancel", () => {
      calls.cancel();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const settingsLinks = () =>
  within(screen.getByRole("navigation", { name: SETTINGS_NAV }))
    .getAllByRole("link")
    .map((link) => link.textContent);

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.mocked(redirectToExternal).mockClear();
});
afterAll(() => server.disable());

describe("Facturación page", () => {
  it("shows the plan, trial days left and the plan cards with ARS prices", async () => {
    useBackend();
    renderAt(FACTURACION_PATH);

    await screen.findByText("Plan actual: Starter");
    expect(screen.getByText("Te quedan 5 días de prueba.")).toBeTruthy();
    expect(screen.getByText(/30\.000,00 por mes/)).toBeTruthy();
    expect(screen.getByText(/80\.000,00 por mes/)).toBeTruthy();
    expect(
      screen.getByText("Hasta 3 miembros y 2 cuentas publicitarias"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Suscribirme a Pro" }),
    ).toBeTruthy();
  });

  it("posts the chosen plan and redirects to Mercado Pago", async () => {
    const calls = useBackend();
    renderAt(FACTURACION_PATH);

    fireEvent.click(
      await screen.findByRole("button", { name: "Suscribirme a Pro" }),
    );

    await waitFor(() =>
      expect(redirectToExternal).toHaveBeenCalledWith(INIT_POINT),
    );
    expect(calls.subscribe).toHaveBeenCalledWith({ planId: "pro" });
  });

  it("explains SUBSCRIPTION_ACTIVE", async () => {
    useBackend();
    server.use(
      http.post("/api/w/w1/billing/subscribe", () =>
        fail("SUBSCRIPTION_ACTIVE", 409),
      ),
    );
    renderAt(FACTURACION_PATH);

    fireEvent.click(
      await screen.findByRole("button", { name: "Suscribirme a Starter" }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Ya tenés una suscripción activa. Cancelala para cambiar de plan.",
    );
    expect(redirectToExternal).not.toHaveBeenCalled();
  });

  it("shows the Mercado Pago error on BILLING_UNAVAILABLE", async () => {
    useBackend();
    server.use(
      http.post("/api/w/w1/billing/subscribe", () =>
        fail("BILLING_UNAVAILABLE", 503),
      ),
    );
    renderAt(FACTURACION_PATH);

    fireEvent.click(
      await screen.findByRole("button", { name: "Suscribirme a Starter" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No pudimos conectar con Mercado Pago",
    );
  });

  it("asks for confirmation, cancels and refetches", async () => {
    const calls = useBackend({ overview: authorizedOverview });
    renderAt(FACTURACION_PATH);

    await screen.findByText("Suscripción activa");
    expect(
      screen.getByText(/Acceso hasta el 15 de marzo de 2030/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Suscribirme/ })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Cancelar suscripción" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(calls.cancel).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(
        "¿Cancelar la suscripción? No se te va a cobrar de nuevo.",
      ),
    ).toBeTruthy();

    const billingFetches = calls.billing.mock.calls.length;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancelar suscripción" }),
    );

    await waitFor(() => expect(calls.cancel).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(calls.billing.mock.calls.length).toBeGreaterThan(billingFetches),
    );
    expect(await screen.findByText("Suscripción cancelada.")).toBeTruthy();
  });

  it("shows only the free plan message on Beta", async () => {
    useBackend({ overview: betaOverview });
    renderAt(FACTURACION_PATH);

    await screen.findByText("Plan Beta gratuito. No tenés que pagar nada.");
    expect(
      screen.queryByRole("button", { name: /Suscribirme|Cancelar/ }),
    ).toBeNull();
  });
});

describe("Ajustes nav", () => {
  it("lists Facturación for the owner right before Peligro", async () => {
    useBackend();
    renderAt("/w/w1/ajustes/cuenta");

    await screen.findByRole("navigation", { name: SETTINGS_NAV });
    const links = settingsLinks();
    expect(links).toContain("Facturación");
    expect(links.indexOf("Facturación")).toBe(links.indexOf("Peligro") - 1);
  });

  it("hides Facturación from the admin", async () => {
    useBackend({ role: "admin" });
    renderAt("/w/w1/ajustes/cuenta");

    await screen.findByRole("navigation", { name: SETTINGS_NAV });
    expect(settingsLinks()).not.toContain("Facturación");
  });
});

describe("Paywall", () => {
  it("shows the plans to the owner of a blocked workspace", async () => {
    useBackend({ blocked: true });
    renderAt("/w/w1/ajustes/cuenta");

    await screen.findByRole("heading", { name: PAYWALL_TITLE });
    expect(
      await screen.findByRole("button", { name: "Suscribirme a Starter" }),
    ).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("tells a non-owner to ask the owner and offers no buttons", async () => {
    useBackend({ role: "admin", blocked: true });
    renderAt("/w/w1/ajustes/cuenta");

    await screen.findByText(
      "Pedile al dueño del espacio que active una suscripción.",
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Ir a mis espacios" }),
    ).toBeTruthy();
  });

  it("renders the normal page when the workspace is not blocked", async () => {
    useBackend();
    renderAt("/w/w1/ajustes/cuenta");

    await screen.findByRole("navigation", { name: SETTINGS_NAV });
    expect(screen.queryByRole("heading", { name: PAYWALL_TITLE })).toBeNull();
  });
});

describe("402 PAYMENT_REQUIRED", () => {
  it("refetches the me query when any query returns it", async () => {
    const calls = useBackend();
    server.use(
      http.get("/api/w/w1/products", () => fail("PAYMENT_REQUIRED", 402)),
    );

    function Probe() {
      useMe();
      useQuery({
        queryKey: ["probe"],
        queryFn: () => apiFetch("/api/w/w1/products"),
      });
      return null;
    }
    render(
      <QueryClientProvider client={createQueryClient()}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(calls.me).toHaveBeenCalledTimes(2));
  });
});
