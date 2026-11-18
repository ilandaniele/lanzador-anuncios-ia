import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Me } from "../../src/shared/schemas/auth";
import { createQueryClient } from "../../src/web/lib/query-client";
import { appRoutes } from "../../src/web/router";

const me: Me = {
  user: { id: "u1", email: "ana@example.com", name: null, isSuperadmin: false },
  workspaces: [
    { id: "w1", name: "Mi negocio", role: "owner", status: "active" },
    { id: "w2", name: "Agencia", role: "viewer", status: "active" },
  ],
};

async function renderAt(path: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/products")
        ? Response.json({ data: [], nextCursor: null })
        : Response.json(me),
    ),
  );
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return router;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("app shell navigation", () => {
  it("exposes labelled navigation landmarks with the current page marked", async () => {
    await renderAt("/w/w1/metricas");

    const sidebar = screen.getByRole("navigation", {
      name: "Navegación principal",
    });
    const sections = within(sidebar)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(sections).toEqual([
      "Hoy",
      "Lanzador",
      "Métricas",
      "Piloto",
      "Creativos",
      "Productos",
      "Historial",
      "Ajustes",
    ]);
    expect(
      within(sidebar).getByRole("link", { name: "Métricas" }).ariaCurrent,
    ).toBe("page");
    expect(
      within(sidebar).getByRole("link", { name: "Hoy" }).ariaCurrent,
    ).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Navegación móvil" }),
    ).toBeTruthy();
  });

  it("makes the skip link the first tab stop and moves focus to the content", async () => {
    await renderAt("/w/w1/hoy");

    const skipLink = screen.getByRole("link", { name: "Saltar al contenido" });
    const firstFocusable = document.querySelector<HTMLElement>(
      "a[href], button, select",
    );
    expect(firstFocusable).toBe(skipLink);

    fireEvent.click(skipLink);
    expect(document.activeElement?.id).toBe("contenido");
  });

  it("lets the keyboard reach nav links and open and close the More sheet", async () => {
    await renderAt("/w/w1/hoy");
    const bottomNav = screen.getByRole("navigation", {
      name: "Navegación móvil",
    });

    const piloto = within(bottomNav).getByRole("link", { name: "Piloto" });
    piloto.focus();
    expect(document.activeElement).toBe(piloto);

    const more = within(bottomNav).getByRole("button", { name: "Más" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    more.focus();
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const sheet = screen.getByRole("navigation", { name: "Más secciones" });
    expect(
      within(sheet)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Lanzador", "Creativos", "Productos", "Ajustes"]);

    fireEvent.keyDown(more, { key: "Escape" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("navigation", { name: "Más secciones" })).toBe(
      null,
    );
  });

  it("navigates from the More sheet and closes it", async () => {
    const router = await renderAt("/w/w1/hoy");
    fireEvent.click(screen.getByRole("button", { name: "Más" }));

    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Más secciones" }),
      ).getByRole("link", { name: "Productos" }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/w/w1/productos"),
    );
    expect(screen.queryByRole("navigation", { name: "Más secciones" })).toBe(
      null,
    );
  });
});

describe("workspace switcher", () => {
  it("shows the role under the current workspace", async () => {
    await renderAt("/w/w1/hoy");

    expect(screen.getByText("Propietario")).toBeTruthy();
  });

  it("changes the URL to the other workspace keeping the section", async () => {
    const router = await renderAt("/w/w1/productos");

    fireEvent.change(screen.getByRole("combobox", { name: "Workspace" }), {
      target: { value: "w2" },
    });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/w/w2/productos"),
    );
    expect(await screen.findByText("Lector")).toBeTruthy();
  });
});

describe("theme", () => {
  it("stores the choice and sets data-theme on the html element", async () => {
    await renderAt("/w/w1/hoy");
    const select = screen.getByRole("combobox", { name: "Tema" });

    fireEvent.change(select, { target: { value: "dark" } });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    fireEvent.change(select, { target: { value: "system" } });
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("restores the stored choice on load", async () => {
    localStorage.setItem("theme", "light");
    await renderAt("/w/w1/hoy");

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
