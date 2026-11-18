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
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AiBudgetScope } from "../../src/shared/constants";
import type { Me } from "../../src/shared/schemas/auth";
import type { CopyDto } from "../../src/shared/schemas/copies";
import { createQueryClient } from "../../src/web/lib/query-client";
import { CopysTab } from "../../src/web/pages/productos/CopysTab";
import { server } from "../helpers/msw/server";
import { copyDto } from "./helpers/copies";

const proposals: CopyDto[] = [
  copyDto({
    id: "s1",
    status: "suggested",
    source: "ai",
    angle: "beneficio",
    headline: "Corré más liviano",
    primaryText: "Zapatillas que no se sienten",
    policyRisk: "high",
    policyNote: "Promete un resultado de salud",
  }),
  ...[2, 3, 4, 5].map((n) =>
    copyDto({
      id: `s${n}`,
      status: "suggested",
      source: "ai",
      angle: "beneficio",
      headline: `Propuesta ${n}`,
      primaryText: `Texto de la propuesta ${n}`,
    }),
  ),
];

const meAs = (role: Me["workspaces"][number]["role"]): Me => ({
  user: {
    id: "u1",
    email: "ana@example.com",
    name: "Ana",
    isSuperadmin: false,
  },
  workspaces: [{ id: "w1", name: "Mi negocio", role, status: "active" }],
});

const budgetError = (scope: AiBudgetScope, resetsAt: string) =>
  HttpResponse.json(
    {
      error: {
        code: "AI_BUDGET_EXHAUSTED",
        message: "AI_BUDGET_EXHAUSTED",
        requestId: "req_1",
        details: { scope, resetsAt },
      },
    },
    { status: 422 },
  );

function useBackend({
  role = "editor",
  saved = [copyDto()],
  generate = () => HttpResponse.json({ data: proposals }),
}: {
  role?: Me["workspaces"][number]["role"];
  saved?: CopyDto[];
  generate?: () => Response;
} = {}) {
  let savedList = saved;
  const calls = { generate: vi.fn(), patch: vi.fn() };
  server.use(
    http.get("/api/me", () => HttpResponse.json(meAs(role))),
    http.get("/api/w/w1/products/p1/copies", () =>
      HttpResponse.json({ data: savedList, nextCursor: null }),
    ),
    http.post("/api/w/w1/products/p1/copies/generate", async ({ request }) => {
      calls.generate(await request.json());
      return generate();
    }),
    http.patch("/api/w/w1/copies/:copyId", async ({ request, params }) => {
      const changes = (await request.json()) as Partial<CopyDto>;
      calls.patch(params.copyId, changes);
      const current = [...savedList, ...proposals].find(
        ({ id }) => id === params.copyId,
      )!;
      const updated = { ...current, ...changes };
      savedList = savedList.filter(({ id }) => id !== current.id);
      if (updated.status === "saved") savedList = [...savedList, updated];
      return HttpResponse.json({ copy: updated });
    }),
  );
  return calls;
}

function renderTab() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <CopysTab workspaceId="w1" productId="p1" />
    </QueryClientProvider>,
  );
}

const generatedRegion = () =>
  screen.findByRole("region", { name: "Propuestas de la IA" });

async function generateWithAngle(name: string) {
  fireEvent.click(
    await screen.findByRole("button", { name: "Generar con IA" }),
  );
  fireEvent.click(screen.getByRole("button", { name: name }));
  fireEvent.click(screen.getByRole("button", { name: "Generar" }));
}

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Producto > pestaña Copys", () => {
  it("lists saved copies in ink with a favorite star", async () => {
    useBackend({ saved: [copyDto({ favorite: true })] });
    renderTab();

    const card = await screen.findByRole("article", {
      name: /Livianas de verdad/,
    });
    expect(within(card).getByText("Guardado")).toBeTruthy();
    expect(
      within(card)
        .getByRole("button", { name: "Quitar de favoritos" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("marks a favorite", async () => {
    const calls = useBackend();
    renderTab();

    fireEvent.click(
      await screen.findByRole("button", { name: "Marcar como favorito" }),
    );

    await waitFor(() => expect(calls.patch).toHaveBeenCalledTimes(1));
    expect(calls.patch).toHaveBeenCalledWith("c1", { favorite: true });
  });

  it("discards a copy and removes it from the list", async () => {
    const calls = useBackend();
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));

    await waitFor(() =>
      expect(calls.patch).toHaveBeenCalledWith("c1", { status: "discarded" }),
    );
    await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
  });

  it("edits a copy in place and cancels with Escape", async () => {
    const calls = useBackend();
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const headline = screen.getByLabelText(/^Título/);
    fireEvent.change(headline, { target: { value: "Más livianas" } });
    fireEvent.keyDown(headline, { key: "Escape" });
    expect(screen.queryByLabelText(/^Título/)).toBeNull();
    expect(calls.patch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText(/^Título/), {
      target: { value: "Más livianas" },
    });
    fireEvent.change(screen.getByLabelText(/^Descripción/), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));

    await waitFor(() =>
      expect(calls.patch).toHaveBeenCalledWith("c1", {
        primaryText: "Corré sin límites",
        headline: "Más livianas",
        description: null,
        status: "saved",
      }),
    );
    expect(await screen.findByText("Más livianas")).toBeTruthy();
  });

  it("hides edit and generate actions from viewers", async () => {
    useBackend({ role: "viewer" });
    renderTab();

    await screen.findByRole("article");
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generar con IA" })).toBeNull();
  });
});

describe("Generar con IA", () => {
  it("shows 5 pencil cards with the high risk warning", async () => {
    const calls = useBackend({ saved: [] });
    renderTab();

    await generateWithAngle("Beneficio");

    const region = await generatedRegion();
    await waitFor(() =>
      expect(within(region).getAllByRole("article")).toHaveLength(5),
    );
    expect(calls.generate).toHaveBeenCalledWith({ angle: "beneficio" });
    expect(within(region).getAllByText("Propuesta")).toHaveLength(5);
    const warning = within(region).getByText(/Promete un resultado de salud/);
    expect(warning.textContent).toContain("Riesgo alto");
  });

  it("changes a proposal to saved when saved in the product", async () => {
    const calls = useBackend({ saved: [] });
    renderTab();
    await generateWithAngle("Beneficio");
    const region = await generatedRegion();
    const proposal = () =>
      within(region).getByRole("article", { name: /Corré más liviano/ });
    await waitFor(() => expect(proposal()).toBeTruthy());
    expect(within(proposal()).queryByText("Guardado")).toBeNull();

    fireEvent.click(
      within(proposal()).getByRole("button", {
        name: "Guardar en el producto",
      }),
    );

    await waitFor(() =>
      expect(calls.patch).toHaveBeenCalledWith("s1", { status: "saved" }),
    );
    await waitFor(() =>
      expect(within(proposal()).getByText("Guardado")).toBeTruthy(),
    );
    expect(within(proposal()).queryByText("Propuesta")).toBeNull();
    expect(
      within(proposal()).queryByRole("button", {
        name: "Guardar en el producto",
      }),
    ).toBeNull();
  });

  it("drops a discarded proposal", async () => {
    const calls = useBackend({ saved: [] });
    renderTab();
    await generateWithAngle("Beneficio");
    const region = await generatedRegion();
    const card = await within(region).findByRole("article", {
      name: /Propuesta 2/,
    });

    fireEvent.click(within(card).getByRole("button", { name: "Descartar" }));

    await waitFor(() =>
      expect(calls.patch).toHaveBeenCalledWith("s2", { status: "discarded" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: /Propuesta 2/ })).toBeNull(),
    );
  });

  it("needs an angle and sends the free text for the free angle", async () => {
    const calls = useBackend({ saved: [] });
    renderTab();
    fireEvent.click(
      await screen.findByRole("button", { name: "Generar con IA" }),
    );

    const generate = screen.getByRole("button", { name: "Generar" });
    expect(generate.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Libre" }));
    expect(generate.getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByLabelText(/^Describí el ángulo/), {
      target: { value: "Vuelta al cole" },
    });
    expect(generate.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(generate);

    await waitFor(() =>
      expect(calls.generate).toHaveBeenCalledWith({
        angle: "libre",
        customAngle: "Vuelta al cole",
      }),
    );
  });

  it.each([
    [
      "workspace_day",
      "2026-11-18T00:00:00.000Z",
      "Usaste toda la IA de hoy. Se renueva a las 21 h.",
    ],
    [
      "workspace_month",
      "2026-12-01T00:00:00.000Z",
      "Llegaste al tope de IA del mes. Se renueva el 1/12.",
    ],
    ["global_day", "2026-11-18T00:00:00.000Z", "IA en pausa hasta las 21 h."],
  ] as const)(
    "disables Generar with the %s reason",
    async (scope, resetsAt, reason) => {
      useBackend({
        saved: [],
        generate: () => budgetError(scope, resetsAt),
      });
      renderTab();

      await generateWithAngle("Beneficio");

      expect((await screen.findByRole("alert")).textContent).toBe(reason);
      const generate = screen.getByRole("button", { name: "Generar" });
      expect(generate.getAttribute("aria-disabled")).toBe("true");
      expect(generate.getAttribute("title")).toBe(reason);
    },
  );
});
