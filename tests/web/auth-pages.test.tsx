import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createMemoryRouter, RouterProvider } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Me } from "../../src/shared/schemas/auth";
import { createQueryClient } from "../../src/web/lib/query-client";
import { appRoutes } from "../../src/web/router";

const me: Me = {
  user: { id: "u1", email: "ana@example.com", name: null, isSuperadmin: false },
  workspaces: [
    { id: "w1", name: "Mi negocio", role: "owner", status: "active" },
  ],
};

const errorBody = (code: string, status: number) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "r1" } },
    { status },
  );

const server = setupServer(
  http.get("/api/me", () => errorBody("UNAUTHENTICATED", 401)),
);
const requests: Array<{ url: string; body: unknown }> = [];

function respondTo(path: string, respond: () => Response) {
  server.use(
    http.post(path, async ({ request }) => {
      requests.push({ url: request.url, body: await request.json() });
      return respond();
    }),
  );
}

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

async function submitEmail(email = "ana@example.com") {
  fireEvent.change(await screen.findByLabelText(/Email/), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviarme el link" }));
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  requests.length = 0;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

describe("login", () => {
  it("asks for the email, then shows 'Revisá tu email' on 202", async () => {
    respondTo("/api/auth/magic-link", () =>
      HttpResponse.json({ ok: true }, { status: 202 }),
    );
    renderAt("/login");

    await submitEmail();

    await screen.findByRole("heading", { name: "Revisá tu email" });
    expect(screen.getByText("ana@example.com").tagName).toBe("STRONG");
    expect(requests).toEqual([
      {
        url: expect.stringContaining("/api/auth/magic-link"),
        body: { email: "ana@example.com" },
      },
    ]);
  });

  it("blocks Reenviar for 60 s with a visible countdown, then resends", async () => {
    respondTo("/api/auth/magic-link", () =>
      HttpResponse.json({ ok: true }, { status: 202 }),
    );
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    renderAt("/login");
    await submitEmail();
    await screen.findByRole("heading", { name: "Revisá tu email" });

    const resend = screen.getByRole("button", { name: "Reenviar en 60 s" });
    expect(resend.getAttribute("aria-disabled")).toBe("true");
    act(() => vi.advanceTimersByTime(18_000));
    screen.getByRole("button", { name: "Reenviar en 42 s" });

    fireEvent.click(screen.getByRole("button", { name: /Reenviar en/ }));
    expect(requests).toHaveLength(1);

    act(() => vi.advanceTimersByTime(42_000));
    const ready = screen.getByRole("button", { name: "Reenviar" });
    expect(ready.getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Ya podés reenviar",
    );

    fireEvent.click(ready);
    await screen.findByRole("button", { name: "Reenviar en 60 s" });
    await waitFor(() => expect(requests).toHaveLength(2));
  });

  it("shows the warning strip on 429", async () => {
    respondTo("/api/auth/magic-link", () => errorBody("RATE_LIMITED", 429));
    renderAt("/login");

    await submitEmail();

    const strip = await screen.findByRole("alert");
    expect(strip.textContent).toContain("Probá en unos minutos");
    expect(
      screen.queryByRole("heading", { name: "Revisá tu email" }),
    ).toBeNull();
  });

  it("rejects a malformed email without calling the API", async () => {
    renderAt("/login");

    await submitEmail("no-es-un-email");

    const input = await screen.findByLabelText(/Email/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Ingresá un email válido")).toBeTruthy();
    expect(requests).toHaveLength(0);
  });

  it("prefills the email from the query string", async () => {
    renderAt("/login?email=ana%40example.com");

    const input = await screen.findByLabelText(/Email/);
    expect((input as HTMLInputElement).value).toBe("ana@example.com");
  });

  it("sends a visitor who already has a session to next", async () => {
    server.use(http.get("/api/me", () => HttpResponse.json(me)));
    const router = renderAt("/login?next=%2Fw%2Fw1%2Fhoy");

    await screen.findByRole("heading", { name: "Hoy" });
    expect(router.state.location.pathname).toBe("/w/w1/hoy");
  });
});

describe("confirm", () => {
  it("does not call the API on load and enters on click, redirecting to next", async () => {
    respondTo("/api/auth/magic-link", () =>
      HttpResponse.json({ ok: true }, { status: 202 }),
    );
    respondTo("/api/auth/verify", () => HttpResponse.json(me));
    const router = renderAt("/login?next=%2Fw%2Fw1%2Fhoy");
    await submitEmail();
    await screen.findByRole("heading", { name: "Revisá tu email" });
    requests.length = 0;

    await act(() => router.navigate("/ingresar/confirmar#t=tok123"));
    const enter = await screen.findByRole("button", {
      name: "Entrar como ana@example.com",
    });
    expect(requests).toHaveLength(0);

    fireEvent.click(enter);

    await screen.findByRole("heading", { name: "Hoy" });
    expect(router.state.location.pathname).toBe("/w/w1/hoy");
    expect(requests).toEqual([
      {
        url: expect.stringContaining("/api/auth/verify"),
        body: { token: "tok123" },
      },
    ]);
    expect(requests[0]?.url).not.toContain("tok123");
  });

  it("falls back to Entrar and the home route when the email is unknown", async () => {
    respondTo("/api/auth/verify", () => HttpResponse.json(me));
    const router = renderAt("/ingresar/confirmar#t=tok123");

    fireEvent.click(await screen.findByRole("button", { name: "Entrar" }));

    await screen.findByRole("heading", { name: "Hoy" });
    expect(router.state.location.pathname).toBe("/w/w1/hoy");
  });

  it("shows 'Link vencido' on 410 and Pedir otro goes to login with the email", async () => {
    localStorage.setItem(
      "lanzador.login",
      JSON.stringify({ email: "ana@example.com", next: null }),
    );
    respondTo("/api/auth/verify", () => errorBody("LINK_EXPIRED", 410));
    const router = renderAt("/ingresar/confirmar#t=old");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Entrar como ana@example.com",
      }),
    );

    await screen.findByRole("heading", { name: "Link vencido" });
    expect(
      screen.getByText("Los links duran 15 minutos y sirven una vez."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pedir otro" }));

    await screen.findByRole("heading", { name: "Ingresá a Lanzador" });
    expect(router.state.location.pathname).toBe("/login");
    expect(new URLSearchParams(router.state.location.search).get("email")).toBe(
      "ana@example.com",
    );
  });

  it("shows 'Link vencido' when the fragment carries no token", async () => {
    renderAt("/ingresar/confirmar");

    await screen.findByRole("heading", { name: "Link vencido" });
    expect(screen.getByRole("button", { name: "Pedir otro" })).toBeTruthy();
    expect(requests).toHaveLength(0);
  });

  it("shows a generic error and keeps the button on other failures", async () => {
    respondTo("/api/auth/verify", () => errorBody("INTERNAL", 500));
    renderAt("/ingresar/confirmar#t=tok123");

    fireEvent.click(await screen.findByRole("button", { name: "Entrar" }));

    const strip = await screen.findByRole("alert");
    expect(strip.textContent).toContain("Algo salió mal");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
  });

  it("ignores an unsafe next remembered from login", async () => {
    localStorage.setItem(
      "lanzador.login",
      JSON.stringify({ email: "ana@example.com", next: "//evil.example" }),
    );
    respondTo("/api/auth/verify", () => HttpResponse.json(me));
    const router = renderAt("/ingresar/confirmar#t=tok123");

    fireEvent.click(await screen.findByRole("button", { name: /Entrar/ }));

    await screen.findByRole("heading", { name: "Hoy" });
    expect(router.state.location.pathname).toBe("/w/w1/hoy");
  });
});

describe("invitation", () => {
  it("accepts with the fragment token and lands in the workspace", async () => {
    respondTo("/api/invitations/accept", () =>
      HttpResponse.json({ workspaceId: "w1", role: "editor" }),
    );
    const router = renderAt("/invitacion#t=inv456");
    server.use(http.get("/api/me", () => HttpResponse.json(me)));

    fireEvent.click(
      await screen.findByRole("button", { name: "Aceptar invitación" }),
    );

    await screen.findByRole("heading", { name: "Hoy" });
    expect(router.state.location.pathname).toBe("/w/w1/hoy");
    expect(requests).toEqual([
      {
        url: expect.stringContaining("/api/invitations/accept"),
        body: { token: "inv456" },
      },
    ]);
    expect(requests[0]?.url).not.toContain("inv456");
  });

  it("shows 'Invitación vencida' on 410", async () => {
    respondTo("/api/invitations/accept", () =>
      errorBody("INVITATION_EXPIRED", 410),
    );
    renderAt("/invitacion#t=old");

    fireEvent.click(
      await screen.findByRole("button", { name: "Aceptar invitación" }),
    );

    await screen.findByRole("heading", { name: "Invitación vencida" });
    expect(
      screen.queryByRole("button", { name: "Aceptar invitación" }),
    ).toBeNull();
  });

  it("shows 'Invitación vencida' when the fragment carries no token", async () => {
    renderAt("/invitacion");

    await screen.findByRole("heading", { name: "Invitación vencida" });
    expect(requests).toHaveLength(0);
  });

  it("explains an email mismatch on 409", async () => {
    respondTo("/api/invitations/accept", () =>
      errorBody("EMAIL_MISMATCH", 409),
    );
    renderAt("/invitacion#t=inv456");

    fireEvent.click(
      await screen.findByRole("button", { name: "Aceptar invitación" }),
    );

    const strip = await screen.findByRole("alert");
    expect(strip.textContent).toContain("otro email");
  });
});

describe("reviewer", () => {
  async function submitCode(code = "reviewer-code") {
    fireEvent.change(await screen.findByLabelText(/Código de acceso/), {
      target: { value: code },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  }

  it("sends the code and opens the returned magic link", async () => {
    respondTo("/api/auth/reviewer", () =>
      HttpResponse.json({
        link: "https://app.example.test/ingresar/confirmar#t=abc",
      }),
    );
    const router = renderAt("/revisor");

    await submitCode();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/ingresar/confirmar"),
    );
    expect(router.state.location.hash).toBe("#t=abc");
    expect(requests).toEqual([
      {
        url: expect.stringContaining("/api/auth/reviewer"),
        body: { code: "reviewer-code" },
      },
    ]);
  });

  it("shows an invalid-code error on 404", async () => {
    respondTo("/api/auth/reviewer", () => errorBody("NOT_FOUND", 404));
    renderAt("/revisor");

    await submitCode();

    expect(await screen.findByText("Código inválido")).toBeTruthy();
  });
});
