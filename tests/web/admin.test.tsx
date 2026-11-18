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
import type { AdminWorkspaceDto } from "../../src/shared/schemas/admin";
import { createQueryClient } from "../../src/web/lib/query-client";
import AdminPage from "../../src/web/pages/admin/AdminPage";
import { server } from "../helpers/msw/server";

const workspaces: AdminWorkspaceDto[] = [
  {
    id: "w1",
    name: "Mi negocio",
    status: "active",
    planId: "beta",
    ownerEmail: "ana@example.com",
    metaStatus: "active",
    memberCount: 7,
    lastActivityAt: "2026-03-15T13:30:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    aiNeuronsMonth: 1500,
  },
  {
    id: "w2",
    name: "Agencia Sur",
    status: "deleting",
    planId: "pro",
    ownerEmail: "beto@example.com",
    metaStatus: null,
    memberCount: 3,
    lastActivityAt: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    aiNeuronsMonth: 0,
  },
  {
    id: "w3",
    name: "Tienda Norte",
    status: "disabled",
    planId: "beta",
    ownerEmail: "carla@example.com",
    metaStatus: "reconnect_required",
    memberCount: 1,
    lastActivityAt: "2026-03-14T13:00:00.000Z",
    createdAt: "2026-01-03T00:00:00.000Z",
    aiNeuronsMonth: 20,
  },
];

const fail = (code: ErrorCode, status: number) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "req_1" } },
    { status },
  );

function useBackend() {
  const calls = { patch: vi.fn(), invite: vi.fn(), list: vi.fn() };
  server.use(
    http.get("/api/admin/workspaces", () => {
      calls.list();
      return HttpResponse.json({ data: workspaces, nextCursor: null });
    }),
    http.patch("/api/admin/workspaces/:id", async ({ request, params }) => {
      calls.patch(params.id, await request.json());
      return HttpResponse.json({ workspace: workspaces[0] });
    }),
    http.post("/api/admin/beta-invites", async ({ request }) => {
      calls.invite(await request.json());
      return HttpResponse.json(
        {
          invite: {
            id: "b1",
            email: "nuevo@example.com",
            note: null,
            usedAt: null,
            revokedAt: null,
          },
        },
        { status: 201 },
      );
    }),
  );
  return calls;
}

async function renderPage() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText("Mi negocio");
}

const rowOf = (name: string) =>
  screen.getByRole("row", { name: new RegExp(name) });

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Admin", () => {
  it("shows member count, last activity, plan and Meta status per workspace", async () => {
    useBackend();
    await renderPage();

    const active = within(rowOf("Mi negocio"));
    expect(active.getByText("7")).toBeTruthy();
    expect(active.getByText("15/03/2026, 10:30")).toBeTruthy();
    expect(active.getByText("beta")).toBeTruthy();
    expect(active.getByText("Conectada")).toBeTruthy();
    expect(active.getByText("Activo")).toBeTruthy();
    expect(active.getByText("ana@example.com")).toBeTruthy();

    const deleting = within(rowOf("Agencia Sur"));
    expect(deleting.getByText("3")).toBeTruthy();
    expect(deleting.getByText("Sin uso")).toBeTruthy();
    expect(deleting.getByText("Sin conexión")).toBeTruthy();
    expect(deleting.getByText("En borrado")).toBeTruthy();
  });

  it("offers suspend, restore and credits depending on the status", async () => {
    useBackend();
    await renderPage();

    const buttons = (name: string) =>
      within(rowOf(name))
        .getAllByRole("button")
        .map((button) => button.textContent);
    expect(buttons("Mi negocio")).toEqual(["Suspender", "Créditos de IA"]);
    expect(buttons("Agencia Sur")).toEqual(["Restaurar", "Créditos de IA"]);
    expect(buttons("Tienda Norte")).toEqual(["Créditos de IA"]);
  });

  it("suspends a workspace only after the receipt is confirmed", async () => {
    const calls = useBackend();
    await renderPage();

    fireEvent.click(
      within(rowOf("Mi negocio")).getByRole("button", { name: "Suspender" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Suspender workspace",
    });
    expect(within(dialog).getByText("Activo → Suspendido")).toBeTruthy();
    expect(calls.patch).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Suspender" }));

    await screen.findByText("Workspace suspendido");
    expect(calls.patch).toHaveBeenCalledWith("w1", { status: "disabled" });
    await waitFor(() => expect(calls.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("restores a workspace being deleted", async () => {
    const calls = useBackend();
    await renderPage();

    fireEvent.click(
      within(rowOf("Agencia Sur")).getByRole("button", { name: "Restaurar" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Restaurar workspace",
    });
    expect(within(dialog).getByText("En borrado → Activo")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Restaurar" }));

    await screen.findByText("Workspace restaurado");
    expect(calls.patch).toHaveBeenCalledWith("w2", { status: "active" });
  });

  it("explains when the restore window expired", async () => {
    useBackend();
    server.use(
      http.patch("/api/admin/workspaces/:id", () =>
        fail("INVALID_STATUS", 422),
      ),
    );
    await renderPage();

    fireEvent.click(
      within(rowOf("Agencia Sur")).getByRole("button", { name: "Restaurar" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Restaurar workspace",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Restaurar" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Pasaron más de 7 días");
  });

  it("saves the daily and monthly neurons override", async () => {
    const calls = useBackend();
    await renderPage();

    fireEvent.click(
      within(rowOf("Mi negocio")).getByRole("button", {
        name: "Créditos de IA",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Créditos de IA/,
    });
    fireEvent.change(within(dialog).getByLabelText(/Override diario/), {
      target: { value: "500" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Override mensual/), {
      target: { value: "12000" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await screen.findByText("Créditos de IA actualizados");
    expect(calls.patch).toHaveBeenCalledWith("w1", {
      aiDailyNeuronsOverride: 500,
      aiMonthlyNeuronsOverride: 12000,
    });
  });

  it("clears an override with an empty field and rejects invalid values", async () => {
    const calls = useBackend();
    await renderPage();

    fireEvent.click(
      within(rowOf("Mi negocio")).getByRole("button", {
        name: "Créditos de IA",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Créditos de IA/,
    });
    fireEvent.change(within(dialog).getByLabelText(/Override diario/), {
      target: { value: "-4" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(
      await within(dialog).findByText("Ingresá un entero de 0 o más"),
    ).toBeTruthy();
    expect(calls.patch).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/Override diario/), {
      target: { value: "" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Override mensual/), {
      target: { value: "800" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await screen.findByText("Créditos de IA actualizados");
    expect(calls.patch).toHaveBeenCalledWith("w1", {
      aiDailyNeuronsOverride: null,
      aiMonthlyNeuronsOverride: 800,
    });
  });

  it("creates a beta invitation with email and note", async () => {
    const calls = useBackend();
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Invitar beta" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Invitar a la beta",
    });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "nuevo@example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Nota/), {
      target: { value: "Agencia amiga" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Enviar invitación" }),
    );

    await screen.findByText("Invitación beta enviada");
    expect(calls.invite).toHaveBeenCalledWith({
      email: "nuevo@example.com",
      note: "Agencia amiga",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("omits the note when empty and explains ALREADY_INVITED", async () => {
    const calls = useBackend();
    server.use(
      http.post("/api/admin/beta-invites", async ({ request }) => {
        calls.invite(await request.json());
        return fail("ALREADY_INVITED", 409);
      }),
    );
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Invitar beta" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Invitar a la beta",
    });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "nuevo@example.com" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Enviar invitación" }),
    );

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("Ese email ya tiene una invitación beta.");
    expect(calls.invite).toHaveBeenCalledWith({ email: "nuevo@example.com" });
  });
});
