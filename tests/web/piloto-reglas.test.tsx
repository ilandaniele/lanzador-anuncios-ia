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
import type { Role } from "../../src/shared/constants";
import type {
  PilotRule,
  UpdatePilotRulesRequest,
} from "../../src/shared/schemas/pilot";
import { createQueryClient } from "../../src/web/lib/query-client";
import PilotoPage from "../../src/web/pages/piloto/PilotoPage";
import { server } from "../helpers/msw/server";
import { WORKSPACE_ID } from "./helpers/launch-progress";
import { usePilotContext } from "./helpers/pilot";
import { defaultRules } from "./helpers/pilot-rules";

const api = `/api/w/${WORKSPACE_ID}/pilot`;

function useBackend(role: Role = "admin") {
  usePilotContext(role);
  const stored = defaultRules();
  const saved = vi.fn<(body: UpdatePilotRulesRequest) => void>();
  server.use(
    http.get(`${api}/proposals`, () =>
      HttpResponse.json({ data: [], nextCursor: null }),
    ),
    http.get(`${api}/runs`, () =>
      HttpResponse.json({ data: [], nextCursor: null }),
    ),
    http.get(`${api}/rules`, () => HttpResponse.json({ data: stored })),
    http.put(`${api}/rules`, async ({ request }) => {
      const body = (await request.json()) as UpdatePilotRulesRequest;
      saved(body);
      for (const rule of body.rules)
        stored.splice(
          stored.findIndex(({ ruleType }) => ruleType === rule.ruleType),
          1,
          rule,
        );
      return HttpResponse.json({ data: stored });
    }),
  );
  return saved;
}

async function renderRules(role: Role = "admin") {
  const saved = useBackend(role);
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/w/${WORKSPACE_ID}/piloto?tab=reglas`]}>
        <Routes>
          <Route path="/w/:workspaceId/piloto" element={<PilotoPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return saved;
}

const SAVE = "Guardar reglas";
const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) =>
  fireEvent.change(input(name), { target: { value } });
const ruleSwitch = (name: string) =>
  screen.getByRole("switch", { name }) as HTMLInputElement;

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("PilotoPage > Reglas", () => {
  it("hides the Reglas tab from editors and shows it to admins", async () => {
    useBackend("editor");
    const view = render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[`/w/${WORKSPACE_ID}/piloto`]}>
          <Routes>
            <Route path="/w/:workspaceId/piloto" element={<PilotoPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("tab", { name: "Historial" });

    expect(screen.queryByRole("tab", { name: "Reglas" })).toBeNull();
    view.unmount();
    server.resetHandlers();

    await renderRules("admin");
    expect(await screen.findByRole("tab", { name: "Reglas" })).toBeTruthy();
  });

  it("falls back to the first visible tab when an editor opens ?tab=reglas", async () => {
    await renderRules("editor");

    expect(
      await screen.findByText(/No hay propuestas pendientes/),
    ).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("renders each rule as a sentence with editable thresholds and a switch", async () => {
    await renderRules();

    expect(await screen.findAllByRole("switch")).toHaveLength(4);
    expect(ruleSwitch("Pausar sin ventas").checked).toBe(true);
    expect(ruleSwitch("Escalar ganador").checked).toBe(false);
    expect(input("Pausar sin ventas: Múltiplo del CPA objetivo").value).toBe(
      "2",
    );
    expect(input("Pausar sin ventas: CPA fijo o de respaldo").value).toBe(
      "15,00",
    );
    expect(
      input("Escalar ganador: Múltiplo del ROAS de equilibrio").value,
    ).toBe("1,3");
    expect(
      (screen.getByLabelText("Pausar sin ventas: Nivel") as HTMLSelectElement)
        .value,
    ).toBe("ad");
  });

  it("shows the save bar only while there are changes", async () => {
    await renderRules();
    await screen.findAllByRole("switch");
    expect(screen.queryByRole("button", { name: SAVE })).toBeNull();

    fireEvent.click(ruleSwitch("Escalar ganador"));
    expect(screen.getByRole("button", { name: SAVE })).toBeTruthy();

    fireEvent.click(ruleSwitch("Escalar ganador"));
    expect(screen.queryByRole("button", { name: SAVE })).toBeNull();

    type("Duplicar ganador: ROAS mínimo", "3");
    expect(screen.getByRole("button", { name: SAVE })).toBeTruthy();
    type("Duplicar ganador: ROAS mínimo", "2");
    expect(screen.queryByRole("button", { name: SAVE })).toBeNull();
  });

  it("sends only the changed rules, with money in minor units", async () => {
    const saved = await renderRules();
    await screen.findAllByRole("switch");

    fireEvent.click(ruleSwitch("Pausar con ROAS bajo"));
    type("Pausar con ROAS bajo: Gasto mínimo", "45,50");
    fireEvent.click(screen.getByRole("button", { name: SAVE }));

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved.mock.calls[0]?.[0]).toEqual({
      rules: [
        {
          ruleType: "pause_low_roas",
          enabled: true,
          params: {
            level: "campaign",
            roasMax: 1,
            minSpendMinor: 4550,
            window: "daily:last_3d",
          },
        },
      ],
    });
    expect(await screen.findByText("Reglas guardadas.")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: SAVE })).toBeNull(),
    );
    expect(input("Pausar con ROAS bajo: Gasto mínimo").value).toBe("45,50");
  });

  it("flags invalid thresholds and saves only the valid rules", async () => {
    const saved = await renderRules();
    await screen.findAllByRole("switch");

    fireEvent.click(ruleSwitch("Escalar ganador"));
    type("Pausar sin ventas: Múltiplo del CPA objetivo", "0");
    type("Duplicar ganador: ROAS mínimo", "abc");

    const invalid = input("Pausar sin ventas: Múltiplo del CPA objetivo");
    expect(invalid.getAttribute("aria-invalid")).toBe("true");
    expect(
      input("Duplicar ganador: ROAS mínimo").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(screen.getAllByText(/Ingresá un valor válido\./)).toHaveLength(2);
    expect(
      screen.getByText(
        "Hay valores inválidos. Se guardan solo las reglas que están bien.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: SAVE }));

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    const rules = saved.mock.calls[0]?.[0].rules as PilotRule[];
    expect(rules.map(({ ruleType }) => ruleType)).toEqual(["scale_winner"]);
    expect(rules[0]?.enabled).toBe(true);
    await screen.findByText("Reglas guardadas.");
    expect(screen.getByRole("button", { name: SAVE })).toBeTruthy();
    expect(input("Pausar sin ventas: Múltiplo del CPA objetivo").value).toBe(
      "0",
    );
  });

  it("blocks saving when every changed rule is invalid", async () => {
    const saved = await renderRules();
    await screen.findAllByRole("switch");

    type("Pausar sin ventas: Múltiplo del CPA objetivo", "");
    const save = screen.getByRole("button", { name: SAVE });
    fireEvent.click(save);

    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getByText("Corregí los valores marcados para guardar."),
    ).toBeTruthy();
    expect(saved).not.toHaveBeenCalled();
  });

  it("rejects fractional days and scale percent above the cap", async () => {
    await renderRules();
    await screen.findAllByRole("switch");

    type("Escalar ganador: Días", "2,5");
    type("Escalar ganador: Porcentaje de aumento", "60");

    expect(input("Escalar ganador: Días").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.getByText(/El máximo es 50 %\./)).toBeTruthy();
  });

  it("keeps the changes and the bar when saving fails", async () => {
    await renderRules();
    await screen.findAllByRole("switch");
    server.use(
      http.put(`${api}/rules`, () =>
        HttpResponse.json(
          { error: { code: "INTERNAL", message: "x", requestId: "r1" } },
          { status: 500 },
        ),
      ),
    );

    fireEvent.click(ruleSwitch("Escalar ganador"));
    fireEvent.click(screen.getByRole("button", { name: SAVE }));

    expect(
      await screen.findByText("No pudimos guardar las reglas. Probá de nuevo."),
    ).toBeTruthy();
    expect(ruleSwitch("Escalar ganador").checked).toBe(true);
    expect(screen.getByRole("button", { name: SAVE })).toBeTruthy();
  });
});
