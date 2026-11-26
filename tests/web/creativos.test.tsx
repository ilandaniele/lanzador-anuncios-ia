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
import type { CreativeDto } from "../../src/shared/schemas/creatives";
import type { AssetDto } from "../../src/shared/schemas/meta-connections";
import { createQueryClient } from "../../src/web/lib/query-client";
import CreativosPage from "../../src/web/pages/creativos/CreativosPage";
import { server } from "../helpers/msw/server";
import type { UploadEnvironment } from "../../src/web/features/uploads/upload-environment";
import { fakeMedia, makeFile } from "./helpers/upload-fakes";

const account = (id: string, name: string): AssetDto => ({
  id,
  kind: "ad_account",
  metaId: `act_${id}`,
  name,
  parentMetaId: null,
  currency: "USD",
  enabled: true,
  health: {
    accountStatus: 1,
    disableReason: null,
    fundingOk: true,
    spendCapPct: null,
    checkedAt: null,
  },
});

const ACCOUNTS = [
  account("acc1", "Cuenta Uruguay"),
  account("acc2", "Cuenta Chile"),
];

const creative = (overrides: Partial<CreativeDto>): CreativeDto => ({
  id: "c1",
  name: "Video testimonio",
  kind: "video",
  status: "ready",
  adAccountAssetId: "acc1",
  thumbnailUrl: "https://scontent.fbcdn.net/c1.jpg",
  formatWarning: null,
  tags: {
    hook: "Antes y después",
    angle: "Ahorro",
    format: "ugc",
    language: "es",
    onScreenText: true,
  },
  aiStatus: "done",
  usedInLaunches: 3,
  createdAt: "2026-11-01T10:00:00.000Z",
  ...overrides,
});

const DEFAULT_CREATIVES = [
  creative({}),
  creative({
    id: "c2",
    name: "Imagen oferta",
    kind: "image",
    tags: {
      hook: "Oferta",
      angle: null,
      format: "estatico",
      language: null,
      onScreenText: null,
    },
    aiStatus: "skipped",
    usedInLaunches: 1,
  }),
  creative({ id: "c3", name: "Video procesando", status: "processing" }),
];

type Backend = {
  role?: "viewer" | "editor";
  failLaunch?: boolean;
};

function useBackend({ role = "editor", failLaunch = false }: Backend = {}) {
  const calls = {
    list: vi.fn(),
    patch: vi.fn(),
    retag: vi.fn(),
    createLaunch: vi.fn(),
    upload: vi.fn(),
  };
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        user: { id: "u1", email: "ana@example.com", name: "Ana" },
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
    http.get("/api/w/w1/meta/assets", () =>
      HttpResponse.json({ data: ACCOUNTS, nextCursor: null }),
    ),
    http.get("/api/w/w1/creatives", ({ request }) => {
      calls.list(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json({ data: DEFAULT_CREATIVES, nextCursor: null });
    }),
    http.patch("/api/w/w1/creatives/:id", async ({ request, params }) => {
      const { tags } = (await request.json()) as { tags: CreativeDto["tags"] };
      calls.patch(params.id, tags);
      return HttpResponse.json({ creative: creative({ tags }) });
    }),
    http.post("/api/w/w1/creatives/:id/retag", ({ params }) => {
      calls.retag(params.id);
      return HttpResponse.json({ aiStatus: "queued" }, { status: 202 });
    }),
    http.post("/api/w/w1/launches", async ({ request }) => {
      calls.createLaunch(await request.json());
      if (failLaunch)
        return HttpResponse.json(
          { error: { code: "INTERNAL", message: "x", requestId: "r2" } },
          { status: 500 },
        );
      return HttpResponse.json({ launch: { id: "l1" } }, { status: 201 });
    }),
    http.post("/api/w/w1/uploads", async ({ request }) => {
      calls.upload(await request.json());
      return HttpResponse.json(
        { error: { code: "INTERNAL", message: "x", requestId: "r3" } },
        { status: 500 },
      );
    }),
  );
  return calls;
}

function renderPage() {
  const environment: UploadEnvironment = {
    media: fakeMedia().environment,
    pollIntervalMs: 20,
    retryDelayMs: 0,
  };
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/w/w1/creativos"]}>
        <Routes>
          <Route
            path="/w/:workspaceId/creativos"
            element={<CreativosPage environment={environment} />}
          />
          <Route
            path="/w/:workspaceId/lanzador/:launchId"
            element={<p>Lanzador abierto</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lastCall = (spy: ReturnType<typeof vi.fn>) => spy.mock.lastCall?.[0];

const openDetail = async (name: string) =>
  fireEvent.click(
    await screen.findByRole("button", { name: `Ver detalle de ${name}` }),
  );

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Creativos > biblioteca", () => {
  it("lists the first account creatives with usage and unconfirmed AI tags", async () => {
    const calls = useBackend();
    renderPage();

    expect(await screen.findByText("Video testimonio")).toBeTruthy();
    expect(calls.list).toHaveBeenCalledWith(
      expect.objectContaining({ adAccountAssetId: "acc1", sort: "recent" }),
    );
    const card = screen.getByText("Video testimonio").closest("li")!;
    expect(within(card).getByText("Usado en 3 lanzamientos")).toBeTruthy();
    expect(within(card).getByText(/Ahorro/).className).toContain(
      "border-dashed",
    );
    const confirmed = screen.getByText("Imagen oferta").closest("li")!;
    expect(within(confirmed).getByText("Usado en 1 lanzamiento")).toBeTruthy();
    expect(within(confirmed).getByText("Oferta").className).not.toContain(
      "border-dashed",
    );
  });

  it("sends adAccountAssetId to the list when the account changes", async () => {
    const calls = useBackend();
    renderPage();
    await screen.findByText("Video testimonio");

    fireEvent.change(screen.getByLabelText("Cuenta publicitaria"), {
      target: { value: "acc2" },
    });

    await waitFor(() =>
      expect(lastCall(calls.list)).toMatchObject({ adAccountAssetId: "acc2" }),
    );
  });

  it("filters by tag and sorts by most used", async () => {
    const calls = useBackend();
    renderPage();
    await screen.findByText("Video testimonio");

    fireEvent.click(screen.getByRole("button", { name: "Oferta" }));
    await waitFor(() =>
      expect(lastCall(calls.list)).toMatchObject({ tag: "Oferta" }),
    );

    fireEvent.change(screen.getByLabelText("Ordenar por"), {
      target: { value: "most_used" },
    });
    await waitFor(() =>
      expect(lastCall(calls.list)).toMatchObject({
        tag: "Oferta",
        sort: "most_used",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Oferta" }));
    await waitFor(() => expect(lastCall(calls.list).tag).toBeUndefined());
  });

  it("switches between grid and list", async () => {
    useBackend();
    renderPage();
    const list = await screen.findByRole("list", {
      name: "Biblioteca de creativos",
    });
    expect(list.className).toContain("grid");

    fireEvent.click(screen.getByLabelText("Lista"));

    expect(
      screen.getByRole("list", { name: "Biblioteca de creativos" }).className,
    ).not.toContain("grid");
  });

  it("sends uploads to the selected account", async () => {
    const calls = useBackend();
    renderPage();
    await screen.findByText("Video testimonio");
    fireEvent.change(screen.getByLabelText("Cuenta publicitaria"), {
      target: { value: "acc2" },
    });

    fireEvent.change(screen.getByLabelText(/Arrastrá videos/), {
      target: { files: [makeFile(1024, "nuevo.mp4")] },
    });

    await waitFor(() =>
      expect(calls.upload).toHaveBeenCalledWith(
        expect.objectContaining({ adAccountAssetId: "acc2" }),
      ),
    );
  });
});

describe("Creativos > detalle", () => {
  it("saves an edited tag with PATCH", async () => {
    const calls = useBackend();
    renderPage();
    await openDetail("Video testimonio");

    const hook = await screen.findByLabelText("Gancho");
    fireEvent.change(hook, { target: { value: "Sin vueltas" } });
    fireEvent.blur(hook);

    await waitFor(() =>
      expect(calls.patch).toHaveBeenCalledWith("c1", {
        hook: "Sin vueltas",
        angle: "Ahorro",
        format: "ugc",
        language: "es",
        onScreenText: true,
      }),
    );
  });

  it("asks for a new AI tagging", async () => {
    const calls = useBackend();
    renderPage();
    await openDetail("Video testimonio");

    fireEvent.click(
      await screen.findByRole("button", { name: "Re-etiquetar con IA" }),
    );

    await waitFor(() => expect(calls.retag).toHaveBeenCalledWith("c1"));
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("is read-only for viewers", async () => {
    useBackend({ role: "viewer" });
    renderPage();
    await openDetail("Video testimonio");

    expect(
      (await screen.findByLabelText("Gancho")).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Re-etiquetar con IA" }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("Creativos > selección", () => {
  it("creates a draft with the chosen creatives", async () => {
    const calls = useBackend();
    renderPage();
    await screen.findByText("Video testimonio");

    fireEvent.click(screen.getByLabelText("Elegir Video testimonio"));
    fireEvent.click(screen.getByLabelText("Elegir Imagen oferta"));
    expect(screen.queryByLabelText("Elegir Video procesando")).toBeNull();
    expect(screen.getByText("2 elegidos")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Usar en lanzamiento" }),
    );

    await waitFor(() =>
      expect(calls.createLaunch).toHaveBeenCalledWith({
        draft: {
          adAccountAssetId: "acc1",
          items: [
            {
              source: "upload",
              creativeId: "c1",
              adName: "Video testimonio",
              mediaKind: "video",
            },
            {
              source: "upload",
              creativeId: "c2",
              adName: "Imagen oferta",
              mediaKind: "image",
            },
          ],
        },
      }),
    );
    expect(await screen.findByText("Lanzador abierto")).toBeTruthy();
  });

  it("shows an error when the draft cannot be created", async () => {
    useBackend({ failLaunch: true });
    renderPage();
    await screen.findByText("Video testimonio");

    fireEvent.click(screen.getByLabelText("Elegir Video testimonio"));
    fireEvent.click(
      screen.getByRole("button", { name: "Usar en lanzamiento" }),
    );

    expect(
      await screen.findByText(
        "No pudimos crear el lanzamiento. Probá de nuevo.",
      ),
    ).toBeTruthy();
  });
});
