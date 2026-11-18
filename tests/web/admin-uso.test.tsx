import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from "react-router";
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
import type {
  AdminErrorDto,
  AdminUsageDto,
} from "../../src/shared/schemas/admin";
import { RouteErrorFallback } from "../../src/web/components/RouteErrorFallback";
import { createQueryClient } from "../../src/web/lib/query-client";
import { installGlobalErrorReporting } from "../../src/web/lib/report-error";
import ErroresPage from "../../src/web/pages/admin/ErroresPage";
import UsoPage from "../../src/web/pages/admin/UsoPage";
import { server } from "../helpers/msw/server";

const usage: AdminUsageDto = {
  workspaces: [
    { id: "w1", name: "Mi negocio", neurons: 12500, metaCalls: 340 },
    { id: "w2", name: "Agencia Sur", neurons: 80, metaCalls: 0 },
  ],
  global: { neuronsToday: 4321 },
  nextCursor: null,
};

const errorEvents: AdminErrorDto[] = [
  {
    id: "e1",
    source: "client",
    route: "/w/w1/hoy",
    status: null,
    code: null,
    message: "Cannot read properties of undefined",
    workspaceId: null,
    requestId: "req_a",
    createdAt: "2026-03-15T13:30:00.000Z",
  },
  {
    id: "e2",
    source: "api",
    route: "/api/w/:wid/launches",
    status: 502,
    code: "META_UNAVAILABLE",
    message: "Meta respondió 502",
    workspaceId: "w1",
    requestId: null,
    createdAt: "2026-03-15T14:00:00.000Z",
  },
];

function renderAt(path: string, page: React.ReactElement) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={page} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function Boom(): React.ReactElement {
  throw new Error("boom único");
}

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.disable());

describe("Admin usage page", () => {
  it("shows neurons and Meta calls per workspace plus the global total of the day", async () => {
    server.use(http.get("/api/admin/usage", () => HttpResponse.json(usage)));
    renderAt("/admin/uso", <UsoPage />);

    const row = await screen.findByRole("row", { name: /Mi negocio/ });
    expect(row.textContent).toContain("12.500");
    expect(row.textContent).toContain("340");
    expect(screen.getByText("4.321")).toBeTruthy();
  });

  it("asks for the chosen month", async () => {
    const months = vi.fn();
    server.use(
      http.get("/api/admin/usage", ({ request }) => {
        months(new URL(request.url).searchParams.get("month"));
        return HttpResponse.json(usage);
      }),
    );
    renderAt("/admin/uso", <UsoPage />);
    await screen.findByText("Mi negocio");

    fireEvent.change(screen.getByLabelText("Mes"), {
      target: { value: "2026-02" },
    });

    await vi.waitFor(() => expect(months).toHaveBeenLastCalledWith("2026-02"));
  });
});

describe("Admin errors page", () => {
  it("lists errors and filters by source", async () => {
    const sources = vi.fn();
    server.use(
      http.get("/api/admin/errors", ({ request }) => {
        const source = new URL(request.url).searchParams.get("source");
        sources(source);
        return HttpResponse.json({
          data: source ? errorEvents.slice(0, 1) : errorEvents,
          nextCursor: null,
        });
      }),
    );
    renderAt("/admin/errores", <ErroresPage />);

    expect(await screen.findByText("Meta respondió 502")).toBeTruthy();
    expect(screen.getByText("502 META_UNAVAILABLE")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Origen"), {
      target: { value: "client" },
    });

    expect(
      await screen.findByText("Cannot read properties of undefined"),
    ).toBeTruthy();
    expect(screen.queryByText("Meta respondió 502")).toBeNull();
    expect(sources).toHaveBeenLastCalledWith("client");
  });
});

describe("Front error reporting", () => {
  const reports = vi.fn();
  let uninstall: () => void;

  beforeEach(() => {
    reports.mockReset();
    server.use(
      http.post("/api/client-errors", async ({ request }) => {
        reports(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    uninstall = installGlobalErrorReporting();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => uninstall());

  it("sends exactly one report for an error thrown in a component", async () => {
    const router = createMemoryRouter(
      [
        {
          errorElement: <RouteErrorFallback />,
          children: [{ path: "/w/x/hoy", element: <Boom /> }],
        },
      ],
      { initialEntries: ["/w/x/hoy?token=secreto"] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    await vi.waitFor(() => expect(reports).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reports).toHaveBeenCalledTimes(1);
    expect(reports).toHaveBeenCalledWith({
      message: "boom único",
      stack: expect.stringContaining("boom único"),
      route: "/",
    });
  });

  it("reports an uncaught window error once, truncated to the schema limits", async () => {
    const error = new Error("x".repeat(5000));
    window.dispatchEvent(new ErrorEvent("error", { error }));
    window.dispatchEvent(new ErrorEvent("error", { error }));

    await vi.waitFor(() => expect(reports).toHaveBeenCalledTimes(1));
    const [{ message }] = reports.mock.calls[0] as [{ message: string }];
    expect(message).toHaveLength(2000);
  });

  it("reports unhandled rejections and survives a failing intake", async () => {
    server.use(http.post("/api/client-errors", () => HttpResponse.error()));
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.assign(rejection, { reason: "rechazo sin Error" });

    expect(() => window.dispatchEvent(rejection)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});
