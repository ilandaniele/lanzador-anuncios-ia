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
import type { WorkspaceOverview } from "../../src/shared/schemas/workspaces";
import { createQueryClient } from "../../src/web/lib/query-client";
import { appRoutes } from "../../src/web/router";
import { server } from "../helpers/msw/server";

type Role = Me["workspaces"][number]["role"];

const overview = (role: Role): WorkspaceOverview => ({
  workspace: {
    id: "w1",
    name: "Mi negocio",
    planId: "free",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  role,
  plan: {
    id: "free",
    name: "Free",
    limits: {
      maxMembers: 3,
      maxAdAccounts: 1,
      maxCreativesPerLaunch: 5,
      aiDailyNeurons: 2000,
      aiMonthlyNeurons: 30000,
    },
  },
  settings: {
    maxCampaignBudgetMinor: 5000,
    budgetCurrency: "USD",
    maxScalePercent: 20,
    advantageCreativeEnabled: false,
    timezone: "America/Argentina/Buenos_Aires",
    defaultCountries: ["AR"],
    nameTemplates: {
      campaign: "{producto} | {fecha}",
      adset: "{audiencia}",
      ad: "{creativo}",
    },
    launchDefaults: {},
  },
  aiUsage: {
    neuronsToday: 0,
    dailyCap: 2000,
    neuronsMonth: 0,
    monthlyCap: 30000,
    globalExhausted: false,
    resetsAt: "2026-01-02T00:00:00.000Z",
  },
});

const meAs = (role: Role, workspaces = true): Me => ({
  user: {
    id: "u1",
    email: "ana@example.com",
    name: "Ana",
    isSuperadmin: false,
  },
  workspaces: workspaces
    ? [{ id: "w1", name: "Mi negocio", role, status: "active" }]
    : [],
});

const fail = (code: ErrorCode, status: number) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "req_1" } },
    { status },
  );

function useBackend(role: Role) {
  const calls = {
    patchWorkspace: vi.fn(),
    patchSettings: vi.fn(),
    deleteWorkspace: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
  };
  let deleted = false;
  server.use(
    http.get("/api/me", () => HttpResponse.json(meAs(role, !deleted))),
    http.get("/api/w/w1", () => HttpResponse.json(overview(role))),
    http.patch("/api/w/w1", async ({ request }) => {
      calls.patchWorkspace(await request.json());
      return HttpResponse.json({ workspace: overview(role).workspace });
    }),
    http.patch("/api/w/w1/settings", async ({ request }) => {
      calls.patchSettings(await request.json());
      return HttpResponse.json(overview(role).settings);
    }),
    http.delete("/api/w/w1", async ({ request }) => {
      calls.deleteWorkspace(await request.json());
      deleted = true;
      return HttpResponse.json(
        { purgeAfter: "2026-01-08T00:00:00.000Z" },
        { status: 202 },
      );
    }),
    http.post("/api/auth/logout", () => {
      calls.logout();
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("/api/auth/logout-all", () => {
      calls.logoutAll();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

async function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return router;
}

const settingsNav = () =>
  screen.getByRole("navigation", { name: "Secciones de ajustes" });

const visibleSections = () =>
  within(settingsNav())
    .getAllByRole("link")
    .map((link) => link.textContent);

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterAll(() => server.disable());

describe("Ajustes navigation by role", () => {
  it("shows every section to the owner", async () => {
    useBackend("owner");
    await renderAt("/w/w1/ajustes/cuenta");

    expect(visibleSections()).toEqual([
      "General",
      "Conexiones",
      "IA",
      "Miembros",
      "Cuenta",
      "Peligro",
    ]);
  });

  it("hides Peligro from the admin", async () => {
    useBackend("admin");
    await renderAt("/w/w1/ajustes/cuenta");

    expect(visibleSections()).toEqual([
      "General",
      "Conexiones",
      "IA",
      "Miembros",
      "Cuenta",
    ]);
  });

  it("hides General, Miembros and Peligro from the editor", async () => {
    useBackend("editor");
    await renderAt("/w/w1/ajustes/cuenta");

    expect(visibleSections()).toEqual(["Conexiones", "IA", "Cuenta"]);
  });

  it("hides Conexiones from the viewer", async () => {
    useBackend("viewer");
    await renderAt("/w/w1/ajustes/cuenta");

    expect(visibleSections()).toEqual(["Cuenta"]);
  });

  it("blocks a section typed in the URL that the role cannot see", async () => {
    useBackend("editor");
    await renderAt("/w/w1/ajustes/general");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No tenés permiso para ver esta sección.",
    );
    expect(screen.queryByLabelText("Nombre del workspace")).toBeNull();
  });
});

describe("Ajustes > Cuenta", () => {
  it("saves the theme choice in the browser and on the html element", async () => {
    useBackend("viewer");
    await renderAt("/w/w1/ajustes/cuenta");

    const content = document.getElementById("contenido")!;
    fireEvent.change(within(content).getByLabelText("Tema"), {
      target: { value: "dark" },
    });

    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("logs out and returns to /login", async () => {
    const calls = useBackend("viewer");
    const router = await renderAt("/w/w1/ajustes/cuenta");

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(calls.logout).toHaveBeenCalledTimes(1);
    expect(calls.logoutAll).not.toHaveBeenCalled();
  });

  it("asks for confirmation, calls logout-all and returns to /login", async () => {
    const calls = useBackend("viewer");
    const router = await renderAt("/w/w1/ajustes/cuenta");

    fireEvent.click(
      screen.getByRole("button", { name: "Cerrar todas las sesiones" }),
    );
    expect(calls.logoutAll).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cerrar todas las sesiones" }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(calls.logoutAll).toHaveBeenCalledTimes(1);
    expect(calls.logout).not.toHaveBeenCalled();
  });

  it("shows a generic error when logout-all fails and stays on the page", async () => {
    useBackend("viewer");
    server.use(http.post("/api/auth/logout-all", () => fail("INTERNAL", 500)));
    const router = await renderAt("/w/w1/ajustes/cuenta");

    fireEvent.click(
      screen.getByRole("button", { name: "Cerrar todas las sesiones" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cerrar todas las sesiones" }),
    );

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "Algo salió mal. Probá de nuevo.",
    );
    expect(router.state.location.pathname).toBe("/w/w1/ajustes/cuenta");
  });
});

describe("Ajustes > General", () => {
  it("loads the current values and hides Guardar cambios until something changes", async () => {
    useBackend("admin");
    await renderAt("/w/w1/ajustes/general");

    expect(
      (
        (await screen.findByLabelText(
          "Nombre del workspace",
        )) as HTMLInputElement
      ).value,
    ).toBe("Mi negocio");
    expect(
      (screen.getByLabelText("Moneda de referencia") as HTMLSelectElement)
        .value,
    ).toBe("USD");
    expect(
      (
        screen.getByLabelText(
          "Tope de presupuesto por campaña",
        ) as HTMLInputElement
      ).value,
    ).toBe("50,00");
    expect(
      screen.queryByRole("button", { name: "Guardar cambios" }),
    ).toBeNull();
  });

  it("sends only the changed parts and confirms with a toast", async () => {
    const calls = useBackend("admin");
    await renderAt("/w/w1/ajustes/general");

    fireEvent.change(await screen.findByLabelText("Nombre del workspace"), {
      target: { value: "Agencia Norte" },
    });
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Permitir mejoras de Advantage+ creative",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Cambios guardados");
    expect(calls.patchWorkspace).toHaveBeenCalledWith({
      name: "Agencia Norte",
    });
    expect(calls.patchSettings).toHaveBeenCalledWith({
      advantageCreativeEnabled: true,
    });
  });

  it("does not call the settings endpoint when only the name changed", async () => {
    const calls = useBackend("admin");
    await renderAt("/w/w1/ajustes/general");

    fireEvent.change(await screen.findByLabelText("Nombre del workspace"), {
      target: { value: "Otro" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Cambios guardados");
    expect(calls.patchSettings).not.toHaveBeenCalled();
  });

  it("blocks saving an empty name", async () => {
    const calls = useBackend("admin");
    await renderAt("/w/w1/ajustes/general");

    fireEvent.change(await screen.findByLabelText("Nombre del workspace"), {
      target: { value: "  " },
    });

    expect(screen.getByText(/Ingresá un nombre/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(calls.patchWorkspace).not.toHaveBeenCalled();
  });

  it("shows a generic error when saving fails", async () => {
    useBackend("admin");
    server.use(http.patch("/api/w/w1/settings", () => fail("INTERNAL", 500)));
    await renderAt("/w/w1/ajustes/general");

    fireEvent.click(
      await screen.findByRole("switch", {
        name: "Permitir mejoras de Advantage+ creative",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Algo salió mal. Probá de nuevo.",
    );
  });
});

describe("Ajustes > Peligro", () => {
  async function openDeleteDialog() {
    fireEvent.click(
      await screen.findByRole("button", { name: "Borrar workspace" }),
    );
    return screen.findByRole("dialog");
  }

  it("keeps the delete button blocked until the exact name is typed", async () => {
    const calls = useBackend("owner");
    await renderAt("/w/w1/ajustes/peligro");
    const dialog = await openDeleteDialog();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Borrar workspace" }),
    );
    expect(calls.deleteWorkspace).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Mi negocio" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Borrar workspace" }),
    );

    await waitFor(() =>
      expect(calls.deleteWorkspace).toHaveBeenCalledWith({
        confirmName: "Mi negocio",
      }),
    );
  });

  it("leaves the deleted workspace behind", async () => {
    useBackend("owner");
    const router = await renderAt("/w/w1/ajustes/peligro");
    const dialog = await openDeleteDialog();

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Mi negocio" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Borrar workspace" }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/onboarding"),
    );
  });

  it("explains CONFIRM_MISMATCH from the API", async () => {
    useBackend("owner");
    server.use(http.delete("/api/w/w1", () => fail("CONFIRM_MISMATCH", 422)));
    const router = await renderAt("/w/w1/ajustes/peligro");
    const dialog = await openDeleteDialog();

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Mi negocio" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Borrar workspace" }),
    );

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "El nombre no coincide. Escribilo exacto.",
    );
    expect(router.state.location.pathname).toBe("/w/w1/ajustes/peligro");
  });

  it("says nothing is touched in Meta", async () => {
    useBackend("owner");
    await renderAt("/w/w1/ajustes/peligro");

    expect(await screen.findByText(/No toca nada en Meta/)).toBeTruthy();
  });
});
