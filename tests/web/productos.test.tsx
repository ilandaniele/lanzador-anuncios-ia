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
import type { Me } from "../../src/shared/schemas/auth";
import type {
  ProductDto,
  ProductListItemDto,
} from "../../src/shared/schemas/products";
import { createQueryClient } from "../../src/web/lib/query-client";
import ProductoFormPage from "../../src/web/pages/productos/ProductoFormPage";
import ProductosPage from "../../src/web/pages/productos/ProductosPage";
import { server } from "../helpers/msw/server";

const listItem = (
  overrides: Partial<ProductListItemDto>,
): ProductListItemDto => ({
  id: "p1",
  name: "Zapatillas",
  landingUrl: "https://tienda.example.com/zapatillas",
  headline: "Zapatillas livianas",
  primaryText: "Las mejores zapatillas",
  cta: "SHOP_NOW",
  landingStatus: "ok",
  breakEvenRoas: 1.67,
  archived: false,
  ...overrides,
});

const products: ProductListItemDto[] = [
  listItem({}),
  listItem({
    id: "p2",
    name: "Remera",
    landingStatus: "error",
    breakEvenRoas: null,
  }),
  listItem({ id: "p3", name: "Gorra", landingStatus: "unchecked" }),
];

const productDto = (overrides: Partial<ProductDto> = {}): ProductDto => ({
  ...listItem({}),
  description: null,
  utm: "utm_source=meta",
  priceMinor: 10000,
  costMinor: 4000,
  currency: "USD",
  profitPerSaleMinor: 6000,
  landingHttpStatus: 200,
  landingError: null,
  landingCheckedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

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

const failWith = (
  code: ErrorCode,
  status: number,
  fields?: Record<string, string>,
) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "req_1", fields } },
    { status },
  );

function useBackend(role: Me["workspaces"][number]["role"] = "editor") {
  const calls = {
    list: vi.fn(),
    create: vi.fn(),
    patch: vi.fn(),
    archive: vi.fn(),
    duplicate: vi.fn(),
    checkLanding: vi.fn(),
  };
  server.use(
    http.get("/api/me", () => HttpResponse.json(meAs(role))),
    http.get("/api/w/w1/products", ({ request }) => {
      const archived = new URL(request.url).searchParams.get("archived");
      calls.list(archived);
      return HttpResponse.json({
        data:
          archived === "true"
            ? [listItem({ id: "p9", name: "Campera", archived: true })]
            : products,
        nextCursor: null,
      });
    }),
    http.get("/api/w/w1/products/:id", () =>
      HttpResponse.json({ product: productDto() }),
    ),
    http.post("/api/w/w1/products", async ({ request }) => {
      calls.create(await request.json());
      return HttpResponse.json(
        { product: productDto({ id: "p-new" }) },
        { status: 201 },
      );
    }),
    http.patch("/api/w/w1/products/:id", async ({ request }) => {
      calls.patch(await request.json());
      return HttpResponse.json({ product: productDto() });
    }),
    http.post("/api/w/w1/products/:id/archive", async ({ request }) => {
      calls.archive(await request.json());
      return HttpResponse.json({ product: productDto({ archived: true }) });
    }),
    http.post("/api/w/w1/products/:id/duplicate", () => {
      calls.duplicate();
      return HttpResponse.json(
        { product: productDto({ id: "p-copy", name: "Zapatillas (copia)" }) },
        { status: 201 },
      );
    }),
    http.post("/api/w/w1/products/:id/check-landing", () => {
      calls.checkLanding();
      return HttpResponse.json({
        status: "soft_ok",
        httpStatus: 403,
        finalUrl: "https://tienda.example.com/zapatillas",
        ms: 120,
      });
    }),
  );
  return calls;
}

function renderAt(path: string) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/w/:workspaceId/productos" element={<ProductosPage />} />
          <Route
            path="/w/:workspaceId/productos/nuevo"
            element={<ProductoFormPage />}
          />
          <Route
            path="/w/:workspaceId/productos/:productId"
            element={<ProductoFormPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rowOf = (name: string) =>
  screen.getByRole("row", { name: new RegExp(name) });

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillRequiredCopy() {
  fill(/^Nombre/, "Buzo");
  fill(/^URL de la landing/, "https://tienda.example.com/buzo");
  fill(/^Texto principal/, "Abrigate con estilo");
  fill(/^Título/, "Buzo canguro");
}

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Productos > lista", () => {
  it("shows landing status and break-even ROAS per product", async () => {
    useBackend();
    renderAt("/w/w1/productos");
    await screen.findByText("Zapatillas");

    expect(within(rowOf("Zapatillas")).getByText("Verificada")).toBeTruthy();
    expect(within(rowOf("Zapatillas")).getByText("1,67")).toBeTruthy();
    expect(within(rowOf("Remera")).getByText("Con problemas")).toBeTruthy();
    expect(within(rowOf("Remera")).getByText("—")).toBeTruthy();
    expect(within(rowOf("Gorra")).getByText("Sin probar")).toBeTruthy();
  });

  it("keeps Lanzar este producto disabled with a reason", async () => {
    useBackend();
    renderAt("/w/w1/productos");
    await screen.findByText("Zapatillas");

    const [launch] = screen.getAllByRole("button", {
      name: /Lanzar este producto/,
    });
    expect(launch?.getAttribute("aria-disabled")).toBe("true");
  });

  it("switches to archived products with the toggle", async () => {
    const calls = useBackend();
    renderAt("/w/w1/productos");
    await screen.findByText("Zapatillas");

    fireEvent.click(screen.getByLabelText("Mostrar archivados"));

    await screen.findByText("Campera");
    expect(calls.list).toHaveBeenLastCalledWith("true");
    expect(screen.queryByText("Zapatillas")).toBeNull();
  });

  it("hides Nuevo producto from viewers", async () => {
    useBackend("viewer");
    renderAt("/w/w1/productos");
    await screen.findByText("Zapatillas");

    expect(screen.queryByRole("button", { name: "Nuevo producto" })).toBeNull();
  });

  it("opens the new product form from the primary action", async () => {
    useBackend();
    renderAt("/w/w1/productos");
    await screen.findByText("Zapatillas");

    fireEvent.click(
      await screen.findByRole("button", { name: "Nuevo producto" }),
    );

    await screen.findByRole("heading", { name: "Nuevo producto" });
  });
});

describe("Productos > formulario", () => {
  it("updates break-even ROAS and profit per sale live", async () => {
    useBackend();
    renderAt("/w/w1/productos/nuevo");
    const panel = (await screen.findByText("Economía en vivo")).closest(
      "section",
    ) as HTMLElement;
    expect(within(panel).getByText(/Cargá precio y costo/)).toBeTruthy();

    fill(/^Precio/, "100");
    fill(/^Costo/, "40");

    expect(within(panel).getByText("1,67")).toBeTruthy();
    expect(within(panel).getByText(/60,00/)).toBeTruthy();

    fill(/^Costo/, "100");

    expect(within(panel).queryByText("1,67")).toBeNull();
    expect(within(panel).getByText(/costo tiene que ser menor/)).toBeTruthy();
  });

  it("previews the final link with the UTM parameters", async () => {
    useBackend();
    renderAt("/w/w1/productos/nuevo");
    await screen.findByText("Economía en vivo");

    fill(/^URL de la landing/, "https://tienda.example.com/buzo");
    fill(/^Parámetros UTM/, "?utm_source=meta&utm_medium=paid");

    expect(
      screen.getByText(
        "https://tienda.example.com/buzo?utm_source=meta&utm_medium=paid",
      ),
    ).toBeTruthy();
  });

  it("creates a product with nulls for empty optional fields", async () => {
    const calls = useBackend();
    renderAt("/w/w1/productos/nuevo");
    await screen.findByText("Economía en vivo");

    fillRequiredCopy();
    fill(/^Precio/, "100");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
    expect(calls.create).toHaveBeenCalledWith({
      name: "Buzo",
      landingUrl: "https://tienda.example.com/buzo",
      primaryText: "Abrigate con estilo",
      headline: "Buzo canguro",
      description: null,
      cta: "SHOP_NOW",
      utm: null,
      priceMinor: 10000,
      costMinor: null,
      currency: "USD",
    });
    await screen.findByRole("heading", { name: "Editar producto" });
  });

  it("shows API field errors on their input and in the summary", async () => {
    useBackend();
    server.use(
      http.post("/api/w/w1/products", () =>
        failWith("VALIDATION", 400, {
          name: "too_small",
          headline: "too_big",
        }),
      ),
    );
    renderAt("/w/w1/productos/nuevo");
    await screen.findByText("Economía en vivo");

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const summary = await screen.findByText("Revisá estos campos");
    const alert = summary.closest("[role=alert]") as HTMLElement;
    expect(within(alert).getByText(/Nombre: Completá este campo/)).toBeTruthy();
    expect(within(alert).getByText(/Título: Es demasiado largo/)).toBeTruthy();

    const name = screen.getByLabelText(/^Nombre/);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const describedBy = name.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toContain(
      "Completá este campo con un valor válido.",
    );
  });

  it("explains LANDING_NOT_HTTPS on the landing input", async () => {
    useBackend();
    server.use(
      http.post("/api/w/w1/products", () =>
        failWith("LANDING_NOT_HTTPS", 422, { landingUrl: "not_https" }),
      ),
    );
    renderAt("/w/w1/productos/nuevo");
    await screen.findByText("Economía en vivo");

    fillRequiredCopy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await screen.findByText("Revisá estos campos");
    expect(screen.getAllByText(/empezar con https/)).toHaveLength(2);
  });

  it("explains NAME_TAKEN on the name input", async () => {
    useBackend();
    server.use(
      http.post("/api/w/w1/products", () => failWith("NAME_TAKEN", 409)),
    );
    renderAt("/w/w1/productos/nuevo");
    await screen.findByText("Economía en vivo");

    fillRequiredCopy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await screen.findByText("Revisá estos campos");
    expect(
      screen.getAllByText(/Ya tenés un producto con ese nombre/),
    ).toHaveLength(2);
  });

  it("saves changes to an existing product with PATCH", async () => {
    const calls = useBackend();
    renderAt("/w/w1/productos/p1");
    await screen.findByDisplayValue("Zapatillas");

    fill(/^Nombre/, "Zapatillas pro");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await screen.findByText("Producto guardado");
    expect(calls.patch).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Zapatillas pro", priceMinor: 10000 }),
    );
  });

  it("only allows Probar once the product is saved with its current URL", async () => {
    const calls = useBackend();
    renderAt("/w/w1/productos/nuevo");
    await screen.findByText("Economía en vivo");
    expect(
      screen
        .getByRole("button", { name: "Probar" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    cleanup();

    renderAt("/w/w1/productos/p1");
    await screen.findByDisplayValue("Zapatillas");
    const test = screen.getByRole("button", { name: "Probar" });
    expect(test.getAttribute("aria-disabled")).toBeNull();

    fill(/^URL de la landing/, "https://otra.example.com");
    expect(test.getAttribute("aria-disabled")).toBe("true");
    fill(/^URL de la landing/, "https://tienda.example.com/zapatillas");

    fireEvent.click(test);

    await waitFor(() => expect(calls.checkLanding).toHaveBeenCalledTimes(1));
    await screen.findByText("Verificada con avisos");
  });

  it("explains a landing that points at the app itself", async () => {
    useBackend();
    server.use(
      http.get("/api/w/w1/products/:id", () =>
        HttpResponse.json({
          product: productDto({
            landingStatus: "error",
            landingHttpStatus: null,
            landingError: "app_host",
          }),
        }),
      ),
    );
    renderAt("/w/w1/productos/p1");

    await screen.findByText(/no puede ser la URL de esta app/);
    expect(screen.queryByText(/app_host/)).toBeNull();
  });

  it("archives only after the receipt is confirmed", async () => {
    const calls = useBackend();
    renderAt("/w/w1/productos/p1");
    await screen.findByDisplayValue("Zapatillas");

    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Archivar producto",
    });
    expect(calls.archive).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Archivar" }));

    await screen.findByText("Producto archivado");
    expect(calls.archive).toHaveBeenCalledWith({ archived: true });
  });

  it("duplicates and opens the copy", async () => {
    const calls = useBackend();
    server.use(
      http.get("/api/w/w1/products/p-copy", () =>
        HttpResponse.json({
          product: productDto({ id: "p-copy", name: "Zapatillas (copia)" }),
        }),
      ),
    );
    renderAt("/w/w1/productos/p1");
    await screen.findByDisplayValue("Zapatillas");

    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));

    await screen.findByDisplayValue("Zapatillas (copia)");
    expect(calls.duplicate).toHaveBeenCalledTimes(1);
  });

  it("hides Duplicar and Archivar from viewers", async () => {
    useBackend("viewer");
    renderAt("/w/w1/productos/p1");
    await screen.findByDisplayValue("Zapatillas");

    expect(screen.queryByRole("button", { name: "Duplicar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archivar" })).toBeNull();
  });

  it("shows a not-found state for an unknown product", async () => {
    useBackend();
    server.use(
      http.get("/api/w/w1/products/:id", () => failWith("NOT_FOUND", 404)),
    );
    renderAt("/w/w1/productos/zzz");

    await screen.findByText("No encontramos este producto.");
  });
});
