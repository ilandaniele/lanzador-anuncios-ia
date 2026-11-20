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
import type { GoogleConnectionResponse } from "../../src/shared/schemas/google";
import type {
  AssetDto,
  ConnectionDto,
} from "../../src/shared/schemas/meta-connections";
import { redirectToExternal } from "../../src/web/features/meta/external-redirect";
import { createQueryClient } from "../../src/web/lib/query-client";
import ConexionesPage from "../../src/web/pages/ajustes/ConexionesPage";
import { server } from "../helpers/msw/server";

vi.mock("../../src/web/features/meta/external-redirect", () => ({
  redirectToExternal: vi.fn(),
}));

type Role = Me["workspaces"][number]["role"];

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
  creativeCount: 4,
};

const asset = (
  id: string,
  kind: AssetDto["kind"],
  name: string,
  enabled = false,
): AssetDto => ({
  id,
  kind,
  metaId: `meta_${id}`,
  name,
  parentMetaId: null,
  currency: null,
  enabled,
  health: {
    accountStatus: null,
    disableReason: null,
    fundingOk: null,
    spendCapPct: null,
    checkedAt: null,
  },
});

const assets: AssetDto[] = [
  asset("a1", "ad_account", "Cuenta Uno", true),
  asset("a2", "ad_account", "Cuenta Dos"),
  asset("p1", "page", "Página Norte"),
  asset("i1", "instagram", "norte_ig"),
  asset("x1", "pixel", "Píxel Web"),
];

const meAs = (role: Role): Me => ({
  user: {
    id: "u1",
    email: "ana@example.com",
    name: "Ana",
    isSuperadmin: false,
  },
  workspaces: [{ id: "w1", name: "Mi negocio", role, status: "active" }],
});

const fail = (code: ErrorCode, status: number) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "req_1" } },
    { status },
  );

const googleConnected: GoogleConnectionResponse = {
  connected: true,
  email: "ana@gmail.com",
  status: "active",
};

function useBackend(
  role: Role,
  {
    connections = [connection],
    google = googleConnected,
  }: { connections?: ConnectionDto[]; google?: GoogleConnectionResponse } = {},
) {
  const calls = {
    patchAssets: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    googleConnect: vi.fn(),
    googleDisconnect: vi.fn(),
  };
  server.use(
    http.get("/api/me", () => HttpResponse.json(meAs(role))),
    http.get("/api/w/w1/meta/connections", () =>
      HttpResponse.json({ data: connections }),
    ),
    http.get("/api/w/w1/google/connection", () => HttpResponse.json(google)),
    http.post("/api/w/w1/google/connect", async ({ request }) => {
      calls.googleConnect(await request.json());
      return HttpResponse.json({
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=s",
      });
    }),
    http.delete("/api/w/w1/google/connection", () => {
      calls.googleDisconnect();
      return new HttpResponse(null, { status: 204 });
    }),
    http.get("/api/w/w1/meta/assets", () =>
      HttpResponse.json({ data: assets, nextCursor: null }),
    ),
    http.post("/api/w/w1/meta/connect", () => {
      calls.connect();
      return HttpResponse.json({
        authorizeUrl: "https://www.facebook.com/dialog/oauth?state=s",
      });
    }),
    http.delete("/api/w/w1/meta/connections/:id", async ({ request }) => {
      calls.disconnect(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

async function renderPage(query = "") {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/w/w1/ajustes/conexiones${query}`]}>
        <Routes>
          <Route
            path="/w/:workspaceId/ajustes/conexiones"
            element={<ConexionesPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Meta" });
}

const group = (name: string) => screen.getByRole("group", { name });

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.mocked(redirectToExternal).mockClear();
});
afterAll(() => server.disable());

describe("Ajustes Conexiones: Meta block", () => {
  it("offers Conectar Meta and redirects to the authorize URL", async () => {
    const calls = useBackend("admin", { connections: [] });
    await renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Conectar Meta" }),
    );

    await waitFor(() =>
      expect(redirectToExternal).toHaveBeenCalledWith(
        "https://www.facebook.com/dialog/oauth?state=s",
      ),
    );
    expect(calls.connect).toHaveBeenCalledTimes(1);
  });

  it("shows status, expiry and enabled ad accounts", async () => {
    useBackend("admin");
    await renderPage();

    expect(await screen.findByText("Mi Negocio SA")).toBeTruthy();
    expect(screen.getByText("Conectado")).toBeTruthy();
    expect(await screen.findByText("Cuenta Uno")).toBeTruthy();
    expect(screen.queryByText("Cuenta Dos")).toBeNull();
  });

  it("flags a connection that needs reconnecting and reconnects", async () => {
    const calls = useBackend("admin", {
      connections: [{ ...connection, status: "reconnect_required" }],
    });
    await renderPage();

    expect((await screen.findAllByText("Reconectar")).length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Reconectar" }));

    await waitFor(() => expect(calls.connect).toHaveBeenCalledTimes(1));
  });

  it("shows the callback result from the query string", async () => {
    useBackend("admin");
    await renderPage("?resultado=error&motivo=META_DENIED");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Cancelaste el permiso en Meta",
    );
  });

  it("opens the asset picker after a successful callback", async () => {
    useBackend("admin");
    await renderPage("?resultado=ok");

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(await screen.findByRole("group", { name: "Páginas" })).toBeTruthy();
  });

  it("hides admin actions from the editor", async () => {
    useBackend("editor");
    await renderPage();

    await screen.findByText("Mi Negocio SA");
    for (const name of ["Reconectar", "Desconectar", "Elegir activos"])
      expect(screen.queryByRole("button", { name })).toBeNull();
  });
});

describe("AssetPicker", () => {
  async function openPicker() {
    useBackend("admin");
    await renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Elegir activos" }),
    );
    await screen.findByRole("group", { name: "Cuentas publicitarias" });
  }

  it("shows the four groups with their counters", async () => {
    await openPicker();

    expect(
      within(group("Cuentas publicitarias")).getByText("1 de 2"),
    ).toBeTruthy();
    for (const name of ["Páginas", "Instagram", "Píxeles"])
      expect(within(group(name)).getByText("0 de 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
  });

  it("selects all in a group and saves only the changes", async () => {
    const patch = vi.fn();
    await openPicker();
    server.use(
      http.patch("/api/w/w1/meta/assets", async ({ request }) => {
        patch(await request.json());
        return HttpResponse.json({ data: [] });
      }),
    );

    fireEvent.click(
      within(group("Cuentas publicitarias")).getByRole("checkbox", {
        name: "Todos",
      }),
    );
    expect(
      within(group("Cuentas publicitarias")).getByText("2 de 2"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith({
        changes: [{ id: "a2", enabled: true }],
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull(),
    );
  });

  it("filters by search after the debounce without touching the counter", async () => {
    await openPicker();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "norte" },
    });

    expect(screen.getByText("Cuenta Dos")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Cuenta Dos")).toBeNull());
    expect(within(group("Páginas")).getByText("Página Norte")).toBeTruthy();
    expect(
      within(group("Cuentas publicitarias")).getByText("Sin resultados"),
    ).toBeTruthy();
    expect(
      within(group("Cuentas publicitarias")).getByText("1 de 2"),
    ).toBeTruthy();
  });

  it("shows an error when the plan ad account limit is exceeded", async () => {
    await openPicker();
    server.use(
      http.patch("/api/w/w1/meta/assets", () =>
        fail("PLAN_AD_ACCOUNT_LIMIT", 422),
      ),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Cuenta Dos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Tu plan no permite habilitar tantas cuentas publicitarias",
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });
});

describe("Disconnect Meta", () => {
  it("asks for confirmation with a receipt before calling the API", async () => {
    const calls = useBackend("admin");
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Desconectar" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Mi Negocio SA")).toBeTruthy();
    expect(within(dialog).getByText("4")).toBeTruthy();
    expect(calls.disconnect).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects after confirming", async () => {
    const calls = useBackend("admin");
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Desconectar" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Desconectar" }),
    );

    await waitFor(() =>
      expect(calls.disconnect).toHaveBeenCalledWith({ confirm: true }),
    );
    expect(await screen.findByText("Meta desconectado")).toBeTruthy();
  });
});

describe("Ajustes Conexiones: Google block", () => {
  const notConnected: GoogleConnectionResponse = {
    connected: false,
    email: null,
    status: null,
  };

  it("shows the connected account", async () => {
    useBackend("editor");
    await renderPage();

    expect(
      await screen.findByText("Conectado como ana@gmail.com"),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Google" })).toBeTruthy();
  });

  it("connects and redirects to Google without a launch", async () => {
    const calls = useBackend("editor", { google: notConnected });
    await renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Conectar Google" }),
    );

    await waitFor(() =>
      expect(redirectToExternal).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth?state=s",
      ),
    );
    expect(calls.googleConnect).toHaveBeenCalledTimes(1);
    expect(calls.googleConnect).toHaveBeenCalledWith({});
  });

  it("asks to reconnect when Google needs it", async () => {
    useBackend("editor", {
      google: { ...googleConnected, status: "reconnect_required" },
    });
    await renderPage();

    expect(
      await screen.findByRole("button", { name: "Reconectar Google" }),
    ).toBeTruthy();
  });

  it("disconnects after confirming", async () => {
    const calls = useBackend("editor");
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Desconectar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Desconectar Google",
    });
    expect(calls.googleDisconnect).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Desconectar" }),
    );

    await waitFor(() =>
      expect(calls.googleDisconnect).toHaveBeenCalledTimes(1),
    );
  });

  it("shows the callback result from the query string", async () => {
    useBackend("editor");
    await renderPage("?google=error&motivo=GOOGLE_DENIED");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Cancelaste el permiso en Google",
    );
  });

  it("hides the block from viewers", async () => {
    useBackend("viewer");
    await renderPage();

    await screen.findByText("Mi Negocio SA");
    expect(screen.queryByRole("heading", { name: "Google" })).toBeNull();
  });
});
