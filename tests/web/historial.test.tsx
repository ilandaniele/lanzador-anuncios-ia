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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AuditEntryDto } from "../../src/shared/schemas/audit";
import type { LaunchListItemDto } from "../../src/shared/schemas/launch";
import type { MemberDto } from "../../src/shared/schemas/members";
import { createQueryClient } from "../../src/web/lib/query-client";
import HistorialPage from "../../src/web/pages/historial/HistorialPage";
import { server } from "../helpers/msw/server";
import {
  launchDto,
  useLaunchBackend,
  useLaunchPost,
  progressDto,
  WORKSPACE_ID,
} from "./helpers/launch-progress";

const api = `/api/w/${WORKSPACE_ID}`;

const launchItem = (
  overrides: Partial<LaunchListItemDto>,
): LaunchListItemDto => ({
  id: "l1",
  status: "paused_verified",
  source: "manual",
  productName: "Zapatillas",
  adAccountName: "Cuenta Uruguay",
  campaignName: "Campaña Verano",
  itemsTotal: 20,
  itemsDone: 18,
  itemsFailed: 2,
  metaCampaignUrl: null,
  createdBy: null,
  createdAt: "2026-11-10T15:00:00.000Z",
  ...overrides,
});

const auditEntry = (overrides: Partial<AuditEntryDto>): AuditEntryDto => ({
  id: "a1",
  actorEmail: "ana@agencia.com",
  origin: "manual",
  action: "meta.budget.scale",
  objectType: "campaign",
  objectId: "120001",
  objectName: "Campaña Verano",
  result: "ok",
  detail: {
    before: { dailyBudgetMinor: 1000 },
    after: { dailyBudgetMinor: 1200 },
  },
  createdAt: "2026-11-11T12:00:00.000Z",
  ...overrides,
});

const MEMBERS: MemberDto[] = [
  {
    userId: "u1",
    email: "ana@agencia.com",
    name: "Ana",
    role: "owner",
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    userId: "u2",
    email: "beto@agencia.com",
    name: null,
    role: "editor",
    joinedAt: "2026-01-02T00:00:00.000Z",
  },
];

function useLaunchPages(pages: Record<string, LaunchListItemDto[]>) {
  const cursors: Array<string | null> = [];
  server.use(
    http.get(`${api}/launches`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      cursors.push(cursor);
      return HttpResponse.json({
        data: pages[cursor ?? "first"] ?? [],
        nextCursor: !cursor && pages["cursor-2"] ? "cursor-2" : null,
      });
    }),
  );
  return cursors;
}

function useAuditPages(pages: Record<string, AuditEntryDto[]>) {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get(`${api}/audit`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      queries.push(query);
      const cursor = query.get("cursor");
      return HttpResponse.json({
        data: pages[cursor ?? "first"] ?? [],
        nextCursor: !cursor && pages["cursor-2"] ? "cursor-2" : null,
      });
    }),
    http.get(`${api}/members`, () =>
      HttpResponse.json({ data: MEMBERS, nextCursor: null }),
    ),
  );
  return queries;
}

function renderHistorial() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/w/${WORKSPACE_ID}/historial`]}>
        <Routes>
          <Route path="/w/:workspaceId/historial" element={<HistorialPage />} />
          <Route
            path="/w/:workspaceId/lanzador/:launchId"
            element={<p>Vista de progreso</p>}
          />
          <Route
            path="/w/:workspaceId/piloto"
            element={<p>Pantalla del piloto</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const openAuditTab = () =>
  fireEvent.click(screen.getByRole("tab", { name: "Acciones" }));

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.disable());

describe("Historial > Lanzamientos", () => {
  it("loads the next page with the cursor and hides the button at the end", async () => {
    const cursors = useLaunchPages({
      first: [launchItem({ id: "l1", productName: "Zapatillas" })],
      "cursor-2": [launchItem({ id: "l2", productName: "Remeras" })],
    });
    renderHistorial();

    await screen.findByText("Zapatillas");
    expect(screen.queryByText("Remeras")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));

    await screen.findByText("Remeras");
    expect(screen.getByText("Zapatillas")).toBeTruthy();
    expect(cursors).toEqual([null, "cursor-2"]);
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  it("shows Activar only on paused_verified launches", async () => {
    useLaunchPages({
      first: [
        launchItem({ id: "l1", status: "paused_verified", productName: "Uno" }),
        launchItem({ id: "l2", status: "active", productName: "Dos" }),
        launchItem({ id: "l3", status: "draft", productName: "Tres" }),
        launchItem({
          id: "l4",
          status: "verified_with_errors",
          productName: "Cuatro",
        }),
      ],
    });
    renderHistorial();

    await screen.findByText("Uno");
    const buttons = screen.getAllByRole("button", { name: /^Activar/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Activar Uno");
    expect(screen.getByText("Activo")).toBeTruthy();
    expect(screen.getByText("En pausa y verificado")).toBeTruthy();
  });

  it("shows ads summary and navigates to the progress view from the row link", async () => {
    useLaunchPages({ first: [launchItem({ id: "l9" })] });
    renderHistorial();

    await screen.findByText("18 ok · 2 error");
    const row = screen.getByRole("row", { name: /Zapatillas/ });
    fireEvent.click(within(row).getAllByRole("link")[0]!);

    await screen.findByText("Vista de progreso");
  });

  it("activates a paused launch through the shared dialog and refreshes the list", async () => {
    useLaunchPages({ first: [launchItem({ id: "l1" })] });
    useLaunchBackend(() => progressDto(), launchDto());
    const received = useLaunchPost("activate");
    renderHistorial();

    fireEvent.click(
      await screen.findByRole("button", { name: "Activar Zapatillas" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Activar" }));

    await waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received).toHaveBeenCalledWith({ confirm: true });
  });

  it("shows an alert with retry when the list fails", async () => {
    server.use(
      http.get(`${api}/launches`, () =>
        HttpResponse.json(
          { error: { code: "FORBIDDEN_ROLE", message: "x", requestId: "r" } },
          { status: 403 },
        ),
      ),
    );
    renderHistorial();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No pudimos cargar el historial.");
  });
});

describe("Historial > Acciones", () => {
  it("loads the next page with the cursor", async () => {
    const queries = useAuditPages({
      first: [auditEntry({ id: "a1", objectName: "Campaña Uno" })],
      "cursor-2": [auditEntry({ id: "a2", objectName: "Campaña Dos" })],
    });
    renderHistorial();
    openAuditTab();

    await screen.findByText(/Campaña Uno/);
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));

    await screen.findByText(/Campaña Dos/);
    expect(queries.map((query) => query.get("cursor"))).toEqual([
      null,
      "cursor-2",
    ]);
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  it("fills the user filter from members and sends actorUserId", async () => {
    const queries = useAuditPages({ first: [auditEntry({})] });
    renderHistorial();
    openAuditTab();

    const select = await screen.findByRole("combobox", { name: "Usuario" });
    await within(select).findByRole("option", { name: "beto@agencia.com" });
    fireEvent.change(select, { target: { value: "u2" } });

    await waitFor(() => expect(queries.at(-1)?.get("actorUserId")).toBe("u2"));
    expect(queries[0]!.has("actorUserId")).toBe(false);
  });

  it("sends the origin filter", async () => {
    const queries = useAuditPages({ first: [auditEntry({})] });
    renderHistorial();
    openAuditTab();

    fireEvent.change(await screen.findByRole("combobox", { name: "Origen" }), {
      target: { value: "pilot" },
    });

    await waitFor(() => expect(queries.at(-1)?.get("origin")).toBe("pilot"));
  });

  it("expands a row to show before and after values", async () => {
    useAuditPages({ first: [auditEntry({})] });
    renderHistorial();
    openAuditTab();

    const toggle = await screen.findByRole("button", { name: "Ver detalle" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const detail = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    )!;
    expect(detail.textContent).toContain("Presupuesto diario (centavos)");
    expect(detail.textContent).toContain("Antes 1000 → Después 1200");
  });

  it("links pilot actions to their proposal and not manual ones", async () => {
    useAuditPages({
      first: [
        auditEntry({
          id: "a1",
          origin: "pilot",
          action: "pilot.proposal.approve",
          detail: { proposalId: "prop-7" },
        }),
        auditEntry({ id: "a2", origin: "manual", detail: null }),
      ],
    });
    renderHistorial();
    openAuditTab();

    const toggles = await screen.findAllByRole("button", {
      name: "Ver detalle",
    });
    toggles.forEach((toggle) => fireEvent.click(toggle));

    const links = screen.getAllByRole("link", {
      name: "Ver propuesta del piloto",
    });
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe(
      `/w/${WORKSPACE_ID}/piloto?propuesta=prop-7`,
    );
    expect(
      screen.getAllByText("Esta acción no registró cambios."),
    ).toHaveLength(2);
  });
});
