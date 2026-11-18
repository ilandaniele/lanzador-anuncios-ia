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
import type { Role } from "../../src/shared/constants";
import type { ErrorCode } from "../../src/shared/errors";
import type {
  PilotProposalDto,
  PilotRunDto,
} from "../../src/shared/schemas/pilot";
import { createQueryClient } from "../../src/web/lib/query-client";
import PilotoPage from "../../src/web/pages/piloto/PilotoPage";
import { server } from "../helpers/msw/server";
import { WORKSPACE_ID } from "./helpers/launch-progress";
import {
  proposalDto,
  scaleProposalDto,
  usePilotContext,
} from "./helpers/pilot";

const api = `/api/w/${WORKSPACE_ID}/pilot`;
const COLLAPSE_WAIT_MS = 3500;

const runDto = (startedAt: string): PilotRunDto => ({
  id: "run1",
  trigger: "cron",
  status: "done",
  proposalsCreated: 2,
  startedAt,
  finishedAt: startedAt,
});

const decided = (overrides: Partial<PilotProposalDto>): PilotProposalDto =>
  proposalDto({
    decidedAt: "2026-01-01T14:35:00.000Z",
    ...overrides,
  });

type Backend = {
  pending?: PilotProposalDto[];
  history?: PilotProposalDto[];
  lastRun?: PilotRunDto | null;
  role?: Role;
};

function useBackend({
  pending = [],
  history = [],
  lastRun = null,
  role = "editor",
}: Backend = {}) {
  usePilotContext(role);
  server.use(
    http.get(`${api}/proposals`, ({ request }) => {
      const status = new URL(request.url).searchParams.get("status");
      const data =
        status === "pending"
          ? pending
          : history.filter((proposal) => proposal.status === status);
      return HttpResponse.json({ data, nextCursor: null });
    }),
    http.get(`${api}/runs`, () =>
      HttpResponse.json({ data: lastRun ? [lastRun] : [], nextCursor: null }),
    ),
  );
}

const failWith = (code: ErrorCode, status: number, details?: object) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "req_1", details } },
    { status },
  );

function renderPiloto(search = "") {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/w/${WORKSPACE_ID}/piloto${search}`]}>
        <Routes>
          <Route path="/w/:workspaceId/piloto" element={<PilotoPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const scrollIntoView = vi.fn();

beforeAll(() => {
  server.enable();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  scrollIntoView.mockClear();
});
afterAll(() => server.disable());

describe("PilotoPage > Pendientes", () => {
  it("shows a skeleton, then tabular evidence with break-even and the rule", async () => {
    useBackend({ pending: [scaleProposalDto()] });
    renderPiloto();

    expect(screen.getByText("Cargando propuestas")).toBeTruthy();
    const card = await screen.findByRole("listitem", {
      name: "Escalar campaña +20 %",
    });

    expect(
      within(card).getByText("Campaña ganadora · Cuenta Uno"),
    ).toBeTruthy();
    expect(
      within(card).getByLabelText("Datos que justifican la propuesta"),
    ).toBeTruthy();
    expect(within(card).getByText("ROAS mínimo").nextSibling?.textContent).toBe(
      "2,40",
    );
    expect(within(card).getByText(/Regla: Escalar ganador/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Pendientes (1)" })).toBeTruthy();
  });

  it("collapses long explanations behind Ver más", async () => {
    const explanation = "Muy buen ROAS sostenido. ".repeat(12);
    useBackend({ pending: [proposalDto({ explanation })] });
    renderPiloto();

    const toggle = await screen.findByRole("button", { name: "Ver más" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(
      screen
        .getByRole("button", { name: "Ver menos" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("shows the final amount for scale and sends it on approve", async () => {
    useBackend({ pending: [scaleProposalDto()] });
    const approved = vi.fn();
    server.use(
      http.post(`${api}/proposals/pr2/approve`, async ({ request }) => {
        approved(await request.json());
        return HttpResponse.json({
          proposal: scaleProposalDto({
            status: "executed",
            decidedAt: "2026-01-01T14:35:00.000Z",
          }),
        });
      }),
    );
    renderPiloto();

    fireEvent.click(
      await screen.findByRole("button", { name: "Aprobar Campaña ganadora" }),
    );
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getAllByText(/60,00/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/50,00 → .*60,00, \+20 %/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Aprobar y escalar a/ }),
    );

    await waitFor(() =>
      expect(approved).toHaveBeenCalledWith({
        confirm: true,
        proposedBudgetMinor: 6000,
      }),
    );
    const stamp = await screen.findByText(/Aprobada .+ por Ana/);
    expect(stamp.closest("li")?.className).toContain("border-ink");
    await waitFor(() => expect(screen.queryByRole("listitem")).toBeNull(), {
      timeout: COLLAPSE_WAIT_MS,
    });
  });

  it("removes the card with a toast on PROPOSAL_STALE", async () => {
    useBackend({ pending: [scaleProposalDto()] });
    server.use(
      http.post(`${api}/proposals/pr2/approve`, () =>
        failWith("PROPOSAL_STALE", 409),
      ),
    );
    renderPiloto();

    fireEvent.click(
      await screen.findByRole("button", { name: "Aprobar Campaña ganadora" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Aprobar y escalar a/ }),
    );

    expect(
      await screen.findByText(
        "La propuesta ya no está vigente. La sacamos de la lista.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a cap error inside the receipt and keeps the card", async () => {
    useBackend({ pending: [scaleProposalDto()] });
    server.use(
      http.post(`${api}/proposals/pr2/approve`, () =>
        failWith("BUDGET_CAP", 422),
      ),
    );
    renderPiloto();

    fireEvent.click(
      await screen.findByRole("button", { name: "Aprobar Campaña ganadora" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Aprobar y escalar a/ }),
    );

    expect(
      await within(dialog).findByText(
        "El nuevo presupuesto supera el tope del workspace.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("dismisses with an optional reason and removes the card", async () => {
    useBackend({ pending: [proposalDto()] });
    const dismissed = vi.fn();
    server.use(
      http.post(`${api}/proposals/pr1/dismiss`, async ({ request }) => {
        dismissed(await request.json());
        return HttpResponse.json({
          proposal: proposalDto({ status: "dismissed" }),
        });
      }),
    );
    renderPiloto();

    fireEvent.click(
      await screen.findByRole("button", { name: "Descartar Campaña floja" }),
    );
    fireEvent.change(screen.getByLabelText("Motivo (opcional)"), {
      target: { value: "  Es una campaña de prueba  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Descartar propuesta" }),
    );

    await waitFor(() =>
      expect(dismissed).toHaveBeenCalledWith({
        reason: "Es una campaña de prueba",
      }),
    );
    expect(await screen.findByText("Propuesta descartada.")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("hides decisions and Correr ahora from viewers", async () => {
    useBackend({ pending: [proposalDto()], role: "viewer" });
    renderPiloto();

    await screen.findByRole("listitem");

    expect(screen.queryByRole("button", { name: /^Aprobar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Descartar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Correr ahora/ })).toBeNull();
  });

  it("shows the empty state without pending proposals", async () => {
    useBackend();
    renderPiloto();

    expect(
      await screen.findByText(/No hay propuestas pendientes/),
    ).toBeTruthy();
  });
});

describe("PilotoPage > Correr ahora", () => {
  it("runs the pilot and reports the new proposals", async () => {
    useBackend();
    const ran = vi.fn();
    server.use(
      http.post(`${api}/run`, () => {
        ran();
        return HttpResponse.json({
          run: runDto("2026-01-01T12:00:00.000Z"),
          proposals: [proposalDto(), scaleProposalDto()],
        });
      }),
    );
    renderPiloto();

    fireEvent.click(
      await screen.findByRole("button", { name: "Correr ahora" }),
    );

    await waitFor(() => expect(ran).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Corrida lista. Propuestas nuevas: 2"),
    ).toBeTruthy();
  });

  it("disables the button with a countdown after a recent run", async () => {
    useBackend({
      lastRun: runDto(new Date(Date.now() - 60_000).toISOString()),
    });
    renderPiloto();

    const waiting = await screen.findByRole("button", {
      name: /Correr ahora en [34]:\d{2}/,
    });

    expect((waiting as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains the limit when the server answers RATE_LIMITED", async () => {
    useBackend();
    server.use(
      http.post(`${api}/run`, () =>
        failWith("RATE_LIMITED", 429, { retryAfterSec: 120 }),
      ),
    );
    renderPiloto();

    fireEvent.click(
      await screen.findByRole("button", { name: "Correr ahora" }),
    );

    expect(
      await screen.findByText(
        "Corriste el piloto hace poco. Probá en unos minutos.",
      ),
    ).toBeTruthy();
  });
});

describe("PilotoPage > Historial", () => {
  const history = [
    decided({ id: "h1", status: "executed" }),
    decided({
      id: "h2",
      status: "dismissed",
      objectName: "Campaña descartada",
      resultMessage: "Es de prueba",
      decidedAt: "2026-01-01T13:00:00.000Z",
    }),
    decided({
      id: "h3",
      status: "failed",
      objectName: "Campaña fallida",
      decidedAt: "2026-01-01T12:00:00.000Z",
    }),
  ];

  it("lists executed, dismissed and failed proposals newest first", async () => {
    useBackend({ history });
    renderPiloto("?tab=historial");

    const table = await screen.findByRole("table", {
      name: "Propuestas resueltas del piloto",
    });
    await waitFor(() =>
      expect(within(table).getAllByRole("row")).toHaveLength(4),
    );
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows[0]?.textContent).toContain("Aprobada");
    expect(rows[1]?.textContent).toContain("Descartada");
    expect(rows[1]?.textContent).toContain("Es de prueba");
    expect(rows[2]?.textContent).toContain("Fallida");
    expect(rows[2]?.textContent).toContain("Falló");
  });

  it("opens the pending card linked from the audit log", async () => {
    useBackend({ pending: [proposalDto(), scaleProposalDto()] });
    renderPiloto("?propuesta=pr2");

    const card = await screen.findByRole("listitem", {
      name: "Escalar campaña +20 %",
    });

    expect(card.className).toContain("ring-primary");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it("opens Historial and marks the linked proposal when it is resolved", async () => {
    useBackend({ history });
    renderPiloto("?propuesta=h2");

    expect(await screen.findByText("Propuesta del enlace")).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Historial" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});
