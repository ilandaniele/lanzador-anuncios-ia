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
import type { Me } from "../../src/shared/schemas/auth";
import type { AiUsage } from "../../src/shared/schemas/workspaces";
import { createQueryClient } from "../../src/web/lib/query-client";
import { appRoutes } from "../../src/web/router";
import { server } from "../helpers/msw/server";

const freshUsage: AiUsage = {
  neuronsToday: 10,
  dailyCap: 2000,
  neuronsMonth: 10,
  monthlyCap: 30000,
  globalExhausted: false,
  resetsAt: "2026-01-02T00:00:00.000Z",
};

const draftReply = {
  messages: [
    {
      id: "m2",
      role: "assistant",
      content: "Listo, armé el borrador.",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  draftLaunchId: "l1",
};

type Role = Me["workspaces"][number]["role"];

const errorReply = (
  status: number,
  code: string,
  details?: Record<string, unknown>,
) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "req_1", details } },
    { status },
  );

function useBackend({
  role = "editor",
  usage = freshUsage,
  reply = () => HttpResponse.json(draftReply),
}: {
  role?: Role;
  usage?: AiUsage;
  reply?: () => Response;
} = {}) {
  const calls = { session: vi.fn(), message: vi.fn() };
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        user: { id: "u1", email: "a@b.c", name: "Ana", isSuperadmin: false },
        workspaces: [
          {
            id: "w1",
            name: "Mi negocio",
            role,
            status: "active",
            billingBlocked: false,
          },
        ],
      }),
    ),
    http.get("/api/w/w1", () => HttpResponse.json({ aiUsage: usage })),
    http.post("/api/w/w1/chat/sessions", () => {
      calls.session();
      return HttpResponse.json(
        { session: { id: `s${calls.session.mock.calls.length}` } },
        { status: 201 },
      );
    }),
    http.post(
      "/api/w/w1/chat/sessions/:sessionId/messages",
      async ({ request, params }) => {
        calls.message(params.sessionId, await request.json());
        return reply();
      },
    ),
    http.get("/api/w/w1/launches/l1", () =>
      HttpResponse.json({
        launch: {
          draft: {
            productId: "p1",
            adAccountAssetId: "a1",
            dailyBudgetMinor: 1000,
            countries: ["AR", "UY"],
            items: [{}, {}],
          },
        },
        items: [],
        checks: null,
        plan: null,
      }),
    ),
    http.get("/api/w/w1/meta/assets", () =>
      HttpResponse.json({
        data: [
          {
            id: "a1",
            kind: "ad_account",
            name: "Cuenta sana",
            currency: "USD",
          },
        ],
        nextCursor: null,
      }),
    ),
    http.get("/api/w/w1/products/p1", () =>
      HttpResponse.json({ product: { id: "p1", name: "Zapatillas" } }),
    ),
  );
  return calls;
}

async function renderShell() {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: ["/w/w1/hoy"],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return router;
}

const panel = () =>
  screen.queryByRole("complementary", { name: "Chat con la IA" });
const composer = () =>
  screen.getByRole("textbox", { name: "Mensaje para la IA" });
const pressCtrlK = () =>
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });

async function openPanel() {
  fireEvent.click(
    await screen.findByRole("button", { name: /Pedile a la IA/ }),
  );
  return screen.findByRole("complementary", { name: "Chat con la IA" });
}

function send(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.keyDown(composer(), { key: "Enter" });
}

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => server.disable());

describe("Chat panel", () => {
  it("shows the draft card and opens step 6 of the draft", async () => {
    const calls = useBackend();
    const router = await renderShell();
    await openPanel();

    send("Lanzá el producto X a 10 dólares en AR");

    const card = await screen.findByRole("article", { name: "Borrador listo" });
    expect(calls.message).toHaveBeenCalledWith("s1", {
      text: "Lanzá el producto X a 10 dólares en AR",
    });
    expect(screen.getByText("Listo, armé el borrador.")).toBeTruthy();
    expect(within(card).getByText("Propuesta")).toBeTruthy();
    expect(await within(card).findByText("Zapatillas")).toBeTruthy();
    expect(within(card).getByText("Cuenta sana")).toBeTruthy();
    expect(within(card).getByText("AR, UY")).toBeTruthy();

    fireEvent.click(
      within(card).getByRole("button", { name: "Abrir en el lanzador" }),
    );

    await waitFor(() =>
      expect(
        router.state.location.pathname + router.state.location.search,
      ).toBe("/w/w1/lanzador/l1?paso=6"),
    );
  });

  it("closes after opening the draft below the docked breakpoint", async () => {
    useBackend();
    await renderShell();
    await openPanel();
    send("Armame un lanzamiento");

    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir en el lanzador" }),
    );

    await waitFor(() => expect(panel()).toBeNull());
  });

  it("stays open after opening the draft when docked", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    useBackend();
    const router = await renderShell();
    await openPanel();
    send("Armame un lanzamiento");

    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir en el lanzador" }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/w/w1/lanzador/l1"),
    );
    expect(panel()).toBeTruthy();
  });

  it("opens with Ctrl+K, focuses the composer and closes with Escape", async () => {
    useBackend();
    await renderShell();
    expect(panel()).toBeNull();

    pressCtrlK();

    const opened = await screen.findByRole("complementary", {
      name: "Chat con la IA",
    });
    expect(
      within(opened).getByText(/No lanza ni cambia presupuestos/),
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(composer()));

    fireEvent.keyDown(composer(), { key: "Escape" });
    await waitFor(() => expect(panel()).toBeNull());
  });

  it("keeps one session across messages and starts a new one on demand", async () => {
    const calls = useBackend();
    await renderShell();
    await openPanel();

    send("Primero");
    await screen.findByRole("article", { name: "Borrador listo" });
    send("Segundo");
    await waitFor(() => expect(calls.message).toHaveBeenCalledTimes(2));
    expect(calls.message.mock.calls.map(([session]) => session)).toEqual([
      "s1",
      "s1",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Nueva conversación" }));
    expect(screen.queryByRole("article")).toBeNull();
    send("Tercero");

    await waitFor(() => expect(calls.message).toHaveBeenCalledTimes(3));
    expect(calls.message.mock.calls[2]![0]).toBe("s2");
  });

  it("disables the button and the composer when the AI quota is exhausted", async () => {
    useBackend({ usage: { ...freshUsage, neuronsToday: 2000 } });
    await renderShell();

    const button = await screen.findByRole("button", {
      name: /Pedile a la IA/,
    });
    await waitFor(() =>
      expect(button.getAttribute("aria-disabled")).toBe("true"),
    );
    expect(button.getAttribute("title")).toBe(
      "Usaste toda la IA de hoy. Se renueva a las 21 h.",
    );

    pressCtrlK();
    await screen.findByRole("complementary", { name: "Chat con la IA" });
    expect(composer().hasAttribute("disabled")).toBe(true);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Usaste toda la IA de hoy. Se renueva a las 21 h.",
    );
  });

  it("disables the composer when the global AI cap is exhausted", async () => {
    useBackend({ usage: { ...freshUsage, globalExhausted: true } });
    await renderShell();

    pressCtrlK();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "IA en pausa hasta las 21 h.",
    );
    expect(composer().hasAttribute("disabled")).toBe(true);
  });

  it("shows the budget message when the server answers AI_BUDGET_EXHAUSTED", async () => {
    useBackend({
      reply: () =>
        errorReply(422, "AI_BUDGET_EXHAUSTED", {
          scope: "workspace_day",
          resetsAt: "2026-01-02T00:00:00.000Z",
        }),
    });
    await renderShell();
    await openPanel();

    send("Armame un lanzamiento");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Usaste toda la IA de hoy. Se renueva a las 21 h.",
    );
    expect(composer().hasAttribute("disabled")).toBe(true);
  });

  it("asks for a new conversation when the session is closed", async () => {
    useBackend({ reply: () => errorReply(409, "SESSION_CLOSED") });
    await renderShell();
    await openPanel();

    send("Hola");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Esta conversación llegó a su límite. Empezá una nueva.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Nueva conversación" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(composer().hasAttribute("disabled")).toBe(false);
  });

  it("hides the chat from viewers", async () => {
    useBackend({ role: "viewer" });
    await renderShell();

    pressCtrlK();

    expect(screen.queryByRole("button", { name: /Pedile a la IA/ })).toBeNull();
    expect(panel()).toBeNull();
  });
});
