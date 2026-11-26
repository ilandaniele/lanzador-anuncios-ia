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
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ErrorCode } from "../../src/shared/errors";
import type { Me } from "../../src/shared/schemas/auth";
import type { InvitationDto } from "../../src/shared/schemas/invitations";
import type { MemberDto } from "../../src/shared/schemas/members";
import { createQueryClient } from "../../src/web/lib/query-client";
import MiembrosPage from "../../src/web/pages/ajustes/MiembrosPage";
import { server } from "../helpers/msw/server";

const members: MemberDto[] = [
  {
    userId: "u1",
    email: "ana@example.com",
    name: "Ana",
    role: "owner",
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    userId: "u2",
    email: "beto@example.com",
    name: null,
    role: "editor",
    joinedAt: "2026-01-02T00:00:00.000Z",
  },
];

const invitations: InvitationDto[] = [
  {
    id: "i1",
    email: "carla@example.com",
    role: "viewer",
    expiresAt: "2026-12-01T00:00:00.000Z",
    status: "pending",
  },
  {
    id: "i2",
    email: "dani@example.com",
    role: "admin",
    expiresAt: "2026-01-01T00:00:00.000Z",
    status: "expired",
  },
  {
    id: "i3",
    email: "eli@example.com",
    role: "admin",
    expiresAt: "2026-12-01T00:00:00.000Z",
    status: "accepted",
  },
];

const meAs = (role: Me["workspaces"][number]["role"]): Me => ({
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
      role,
      status: "active",
      billingBlocked: false,
    },
  ],
});

const errorBody = (code: ErrorCode) => ({
  error: { code, message: code, requestId: "req_1" },
});

const fail = (code: ErrorCode, status: number) =>
  HttpResponse.json(errorBody(code), { status });

function useBackend(role: Me["workspaces"][number]["role"]) {
  const calls = {
    invite: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    revoke: vi.fn(),
    transfer: vi.fn(),
    invitationsList: vi.fn(),
  };
  server.use(
    http.get("/api/me", () => HttpResponse.json(meAs(role))),
    http.get("/api/w/w1/members", () =>
      HttpResponse.json({ data: members, nextCursor: null }),
    ),
    http.get("/api/w/w1/invitations", () => {
      calls.invitationsList();
      return HttpResponse.json({ data: invitations, nextCursor: null });
    }),
    http.post("/api/w/w1/invitations", async ({ request }) => {
      calls.invite(await request.json());
      return HttpResponse.json({ invitation: invitations[0] }, { status: 201 });
    }),
    http.patch("/api/w/w1/members/:userId", async ({ request, params }) => {
      calls.patch(params.userId, await request.json());
      return HttpResponse.json({ member: members[1] });
    }),
    http.delete("/api/w/w1/members/:userId", ({ params }) => {
      calls.remove(params.userId);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete("/api/w/w1/invitations/:id", ({ params }) => {
      calls.revoke(params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("/api/w/w1/transfer-ownership", async ({ request }) => {
      calls.transfer(await request.json());
      return HttpResponse.json({ workspace: { id: "w1" } });
    }),
  );
  return calls;
}

async function renderPage() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/w/w1/ajustes/miembros"]}>
        <Routes>
          <Route
            path="/w/:workspaceId/ajustes/miembros"
            element={<MiembrosPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText("beto@example.com");
}

const rowOf = (email: string) =>
  screen.getByRole("row", { name: new RegExp(email) });

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Ajustes > Miembros", () => {
  it("lists members and live invitations with their status", async () => {
    useBackend("owner");
    await renderPage();

    expect(within(rowOf("ana@example.com")).getByText("Activo")).toBeTruthy();
    expect(
      within(rowOf("carla@example.com")).getByText("Invitación pendiente"),
    ).toBeTruthy();
    expect(
      within(rowOf("dani@example.com")).getByText("Invitación vencida"),
    ).toBeTruthy();
    expect(screen.queryByText("eli@example.com")).toBeNull();
  });

  it("shows the owner role as text and the others as an inline select", async () => {
    useBackend("owner");
    await renderPage();

    expect(within(rowOf("ana@example.com")).queryByRole("combobox")).toBeNull();
    const select = screen.getByRole("combobox", {
      name: "Rol de beto@example.com",
    }) as HTMLSelectElement;
    expect(select.value).toBe("editor");
  });

  it("changes a member role with PATCH and confirms with a toast", async () => {
    const calls = useBackend("owner");
    await renderPage();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Rol de beto@example.com" }),
      { target: { value: "admin" } },
    );

    await screen.findByText("Rol actualizado");
    expect(calls.patch).toHaveBeenCalledWith("u2", { role: "admin" });
  });

  it("shows a role change error from the API", async () => {
    useBackend("owner");
    server.use(
      http.patch("/api/w/w1/members/:userId", () =>
        fail("CANNOT_CHANGE_OWNER", 422),
      ),
    );
    await renderPage();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Rol de beto@example.com" }),
      { target: { value: "admin" } },
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("El rol del propietario no se cambia");
  });

  it("invites with email and role after reading what each role can do", async () => {
    const calls = useBackend("owner");
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Invitar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Invitar miembro",
    });
    expect(within(dialog).getByText(/Gestiona miembros/)).toBeTruthy();
    expect(within(dialog).getByText(/Crea y lanza campañas/)).toBeTruthy();
    expect(within(dialog).getByText(/Solo mira métricas/)).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "nuevo@example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Rol/), {
      target: { value: "editor" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Enviar invitación" }),
    );

    await screen.findByText("Invitación enviada");
    expect(calls.invite).toHaveBeenCalledWith({
      email: "nuevo@example.com",
      role: "editor",
    });
    await waitFor(() => expect(calls.invitationsList).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the dialog open and explains INVITATION_PENDING", async () => {
    useBackend("owner");
    server.use(
      http.post("/api/w/w1/invitations", () => fail("INVITATION_PENDING", 409)),
    );
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Invitar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Invitar miembro",
    });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "carla@example.com" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Enviar invitación" }),
    );

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe(
      "Ya hay una invitación pendiente para ese email.",
    );
  });

  it("removes a member after a receipt and refreshes the list", async () => {
    const calls = useBackend("owner");
    await renderPage();

    fireEvent.click(
      within(rowOf("beto@example.com")).getByRole("button", { name: "Quitar" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Quitar miembro",
    });
    expect(within(dialog).getByText("beto@example.com")).toBeTruthy();
    expect(within(dialog).getByText("Editor")).toBeTruthy();
    expect(calls.remove).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));

    await screen.findByText("Miembro quitado");
    expect(calls.remove).toHaveBeenCalledWith("u2");
  });

  it("shows OWNER_CANNOT_LEAVE inside the removal receipt", async () => {
    useBackend("owner");
    server.use(
      http.delete("/api/w/w1/members/:userId", () =>
        fail("OWNER_CANNOT_LEAVE", 422),
      ),
    );
    await renderPage();

    fireEvent.click(
      within(rowOf("beto@example.com")).getByRole("button", { name: "Quitar" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Quitar miembro",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("El propietario no se puede quitar");
    expect(screen.getByRole("dialog", { name: "Quitar miembro" })).toBeTruthy();
  });

  it("does not offer to remove the owner", async () => {
    useBackend("owner");
    await renderPage();

    expect(within(rowOf("ana@example.com")).queryByRole("button")).toBeNull();
  });

  it("revokes a pending invitation after confirmation", async () => {
    const calls = useBackend("owner");
    await renderPage();

    fireEvent.click(
      within(rowOf("carla@example.com")).getByRole("button", {
        name: "Revocar",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Revocar invitación",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revocar" }));

    await screen.findByText("Invitación revocada");
    expect(calls.revoke).toHaveBeenCalledWith("i1");
  });

  it("transfers ownership only after the receipt is confirmed", async () => {
    const calls = useBackend("owner");
    await renderPage();

    fireEvent.click(
      within(rowOf("beto@example.com")).getByRole("button", {
        name: "Transferir propiedad",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Transferir propiedad",
    });
    expect(within(dialog).getByText("Nuevo propietario")).toBeTruthy();
    expect(within(dialog).getByText("beto@example.com")).toBeTruthy();
    expect(within(dialog).getByText("Tu rol después")).toBeTruthy();
    expect(within(dialog).getByText("Administrador")).toBeTruthy();
    expect(calls.transfer).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Transferir" }));

    await screen.findByText("Propiedad transferida");
    expect(calls.transfer).toHaveBeenCalledWith({
      userId: "u2",
      confirm: true,
    });
  });

  it("explains NOT_A_MEMBER when the successor is gone", async () => {
    useBackend("owner");
    server.use(
      http.post("/api/w/w1/transfer-ownership", () =>
        fail("NOT_A_MEMBER", 422),
      ),
    );
    await renderPage();

    fireEvent.click(
      within(rowOf("beto@example.com")).getByRole("button", {
        name: "Transferir propiedad",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Transferir propiedad",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Transferir" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("ya no es miembro");
  });

  it("hides ownership transfer from admins", async () => {
    useBackend("admin");
    await renderPage();

    expect(
      screen.queryByRole("button", { name: "Transferir propiedad" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Invitar" })).toBeTruthy();
  });

  it("gives viewers a read-only list without invitation requests", async () => {
    const calls = useBackend("viewer");
    await renderPage();

    expect(screen.queryByRole("button", { name: "Invitar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quitar" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("carla@example.com")).toBeNull();
    expect(calls.invitationsList).not.toHaveBeenCalled();
  });
});
