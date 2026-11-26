import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Me } from "../../src/shared/schemas/auth";
import { createQueryClient } from "../../src/web/lib/query-client";
import { appRoutes } from "../../src/web/router";

const workspace = {
  id: "w1",
  name: "Mi negocio",
  role: "owner" as const,
  status: "active" as const,
  billingBlocked: false,
};

const meFor = (overrides: Partial<Me["user"]> = {}): Me => ({
  user: {
    id: "u1",
    email: "ana@example.com",
    name: null,
    isSuperadmin: false,
    ...overrides,
  },
  workspaces: [workspace],
});

function stubMe(me: Me | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      me
        ? Response.json(me)
        : Response.json(
            {
              error: {
                code: "UNAUTHENTICATED",
                message: "No autenticado",
                requestId: "r1",
              },
            },
            { status: 401 },
          ),
    ),
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("route guards", () => {
  it("sends a visitor without session to /login with next", async () => {
    stubMe(null);
    const router = renderAt("/w/w1/productos?archived=1");

    await screen.findByRole("heading", { name: "Ingresá a Lanzador" });
    const { pathname, search } = router.state.location;
    expect(pathname).toBe("/login");
    expect(new URLSearchParams(search).get("next")).toBe(
      "/w/w1/productos?archived=1",
    );
  });

  it("sends /admin without session to /login with next", async () => {
    stubMe(null);
    const router = renderAt("/admin");

    await screen.findByRole("heading", { name: "Ingresá a Lanzador" });
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe(
      "/admin",
    );
  });

  it("shows the page to a member of the workspace", async () => {
    stubMe(meFor());
    renderAt("/w/w1/hoy");

    expect(await screen.findByRole("heading", { name: "Hoy" })).toBeTruthy();
  });

  it("shows 404 for a workspace the user does not belong to", async () => {
    stubMe(meFor());
    renderAt("/w/other/hoy");

    expect(
      await screen.findByRole("heading", {
        name: "No encontramos esta página",
      }),
    ).toBeTruthy();
  });

  it("shows 404 on /admin to a user who is not superadmin", async () => {
    stubMe(meFor());
    renderAt("/admin");

    expect(
      await screen.findByRole("heading", {
        name: "No encontramos esta página",
      }),
    ).toBeTruthy();
  });

  it("shows /admin to a superadmin", async () => {
    stubMe(meFor({ isSuperadmin: true }));
    renderAt("/admin");

    expect(
      await screen.findByRole("heading", { name: "Administración" }),
    ).toBeTruthy();
  });

  it("redirects / to the first workspace", async () => {
    stubMe(meFor());
    const router = renderAt("/");

    await screen.findByRole("heading", { name: "Hoy" });
    expect(router.state.location.pathname).toBe("/w/w1/hoy");
  });

  it("redirects / to the first workspace that is not billing blocked", async () => {
    stubMe({
      ...meFor(),
      workspaces: [
        { ...workspace, id: "blocked", billingBlocked: true },
        { ...workspace, id: "w2" },
      ],
    });
    const router = renderAt("/");

    await screen.findByRole("heading", { name: "Hoy" });
    expect(router.state.location.pathname).toBe("/w/w2/hoy");
  });
});
