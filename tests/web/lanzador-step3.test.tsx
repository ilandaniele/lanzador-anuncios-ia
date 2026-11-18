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
import { useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { LandingStatus } from "../../src/shared/constants";
import type { CopyDto } from "../../src/shared/schemas/copies";
import type { PartialLaunchDraft } from "../../src/shared/schemas/launch";
import type {
  ProductDto,
  ProductListItemDto,
} from "../../src/shared/schemas/products";
import { isProductStepComplete } from "../../src/web/features/launch/product-completion";
import { WizardFooter } from "../../src/web/features/launch/WizardFooter";
import { createQueryClient } from "../../src/web/lib/query-client";
import { Step3Product } from "../../src/web/pages/lanzador/Step3Product";
import { server } from "../helpers/msw/server";
import { copyDto } from "./helpers/copies";

const listItem = (
  id: string,
  name: string,
  landingStatus: LandingStatus,
): ProductListItemDto => ({
  id,
  name,
  landingUrl: `https://tienda.example.com/${id}`,
  headline: `Título ${name}`,
  primaryText: `Texto ${name}`,
  cta: "SHOP_NOW",
  landingStatus,
  breakEvenRoas: null,
  archived: false,
});

const toProduct = (item: ProductListItemDto): ProductDto => ({
  ...item,
  description: null,
  utm: null,
  priceMinor: null,
  costMinor: null,
  currency: "USD",
  profitPerSaleMinor: null,
  landingHttpStatus: 200,
  landingError: null,
  landingCheckedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const products = [
  listItem("p1", "Zapatillas", "ok"),
  listItem("p2", "Remera", "error"),
  listItem("p3", "Gorra", "soft_ok"),
];

const copies: CopyDto[] = [
  copyDto({ favorite: true }),
  copyDto({
    id: "c2",
    primaryText: "Tus pies lo van a notar",
    headline: "Comodidad todo el día",
    description: null,
  }),
];

function useBackend(created?: ProductDto) {
  const createCalls: unknown[] = [];
  server.use(
    http.get("/api/w/w1/products", () =>
      HttpResponse.json({ data: products, nextCursor: null }),
    ),
    http.get("/api/w/w1/products/:productId", ({ params }) => {
      const item = [...products, ...(created ? [created] : [])].find(
        ({ id }) => id === params.productId,
      );
      return item
        ? HttpResponse.json({ product: toProduct(item) })
        : HttpResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    }),
    http.get("/api/w/w1/products/:productId/copies", () =>
      HttpResponse.json({ data: copies }),
    ),
    http.post("/api/w/w1/products", async ({ request }) => {
      createCalls.push(await request.json());
      return HttpResponse.json({ product: created }, { status: 201 });
    }),
  );
  return createCalls;
}

function Harness({
  initial,
  onDraft,
}: {
  initial: PartialLaunchDraft;
  onDraft: (draft: PartialLaunchDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  onDraft(draft);
  return (
    <>
      <Step3Product
        workspaceId="w1"
        draft={draft}
        update={(changes) =>
          setDraft((previous) => ({ ...previous, ...changes }))
        }
        setBlockReason={setBlockReason}
      />
      <WizardFooter
        saveState="saved"
        onNext={() => undefined}
        nextBlockedReason={
          blockReason ??
          (isProductStepComplete(draft) ? undefined : "incompleto")
        }
      />
    </>
  );
}

function renderStep(initial: PartialLaunchDraft = {}) {
  let latest: PartialLaunchDraft = initial;
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Harness initial={initial} onDraft={(draft) => (latest = draft)} />
    </QueryClientProvider>,
  );
  return { lastDraft: () => latest };
}

const draftFor = (item: ProductListItemDto): PartialLaunchDraft => ({
  productId: item.id,
  copy: {
    primaryText: item.primaryText,
    headline: item.headline,
    cta: item.cta,
  },
});

const nextButton = () => screen.getByRole("button", { name: "Siguiente" });

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Lanzador > paso 3", () => {
  it("blocks Siguiente and explains when the landing is in error", async () => {
    useBackend();
    renderStep(draftFor(products[1]!));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "La landing tiene problemas",
    );
    await waitFor(() =>
      expect(nextButton().getAttribute("aria-disabled")).toBe("true"),
    );
  });

  it("warns on soft_ok without blocking Siguiente", async () => {
    useBackend();
    renderStep(draftFor(products[2]!));

    expect(
      (await screen.findByText(/La landing respondió con avisos/)).getAttribute(
        "role",
      ),
    ).toBe("status");
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() =>
      expect(nextButton().getAttribute("aria-disabled")).toBeNull(),
    );
  });

  it("fills the draft copy from the product chosen in the combobox", async () => {
    useBackend();
    const { lastDraft } = renderStep();

    fireEvent.click(await screen.findByRole("combobox", { name: /^Producto/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Zapatillas" }));

    expect(lastDraft()).toMatchObject({
      productId: "p1",
      copy: {
        primaryText: "Texto Zapatillas",
        headline: "Título Zapatillas",
        cta: "SHOP_NOW",
      },
    });
    expect(await screen.findByText("Verificada")).toBeTruthy();
  });

  it("uses the first checked saved copy and offers rotation from two copies", async () => {
    useBackend();
    const { lastDraft } = renderStep(draftFor(products[0]!));

    fireEvent.click(await screen.findByRole("checkbox", { name: /Livianas/ }));
    expect(lastDraft().copy).toEqual({
      copyId: "c1",
      primaryText: "Corré sin límites",
      headline: "Livianas de verdad",
      description: "Envío gratis",
      cta: "SHOP_NOW",
    });
    expect(screen.queryByRole("switch")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: /Comodidad/ }));
    const rotation = screen.getByRole("switch", { name: /Rotar los copys/ });
    expect((rotation as HTMLInputElement).checked).toBe(true);
    fireEvent.click(rotation);
    expect((rotation as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("checkbox", { name: /Livianas/ }));
    expect(lastDraft().copy?.copyId).toBe("c2");
    fireEvent.click(screen.getByRole("checkbox", { name: /Comodidad/ }));
    expect(lastDraft().copy).toEqual({
      primaryText: "Texto Zapatillas",
      headline: "Título Zapatillas",
      cta: "SHOP_NOW",
    });
  });

  it("opens the Generar con IA panel inline", async () => {
    useBackend();
    renderStep(draftFor(products[0]!));

    const generate = await screen.findByRole("button", {
      name: "Generar con IA",
    });
    expect(generate.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(generate);

    expect(screen.getByRole("button", { name: "Beneficio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generar" })).toBeTruthy();
  });

  it("creates a product in the modal and selects it", async () => {
    const created = listItem("p9", "Buzo", "unchecked");
    const createCalls = useBackend(toProduct(created));
    const { lastDraft } = renderStep();

    fireEvent.click(
      await screen.findByRole("button", { name: "Crear producto" }),
    );
    const dialog = await screen.findByRole("dialog");
    const fill = (label: RegExp, value: string) =>
      fireEvent.change(within(dialog).getByLabelText(label), {
        target: { value },
      });
    fill(/^Nombre/, "Buzo");
    fill(/^URL de la landing/, "https://tienda.example.com/p9");
    fill(/^Texto principal/, "Texto Buzo");
    fill(/^Título/, "Título Buzo");
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(createCalls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(lastDraft()).toMatchObject({
      productId: "p9",
      copy: { headline: "Título Buzo" },
    });
  });
});

describe("isProductStepComplete", () => {
  it("needs a product and its copy fields", () => {
    expect(isProductStepComplete({})).toBe(false);
    expect(isProductStepComplete({ productId: "p1" })).toBe(false);
    expect(isProductStepComplete(draftFor(products[0]!))).toBe(true);
  });
});
