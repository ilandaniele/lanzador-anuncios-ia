import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { LaunchProgress } from "../../src/shared/schemas/launch";
import { LaunchIndicator } from "../../src/web/layout/LaunchIndicator";
import { createQueryClient } from "../../src/web/lib/query-client";
import { ProgressView } from "../../src/web/pages/lanzador/ProgressView";
import { server } from "../helpers/msw/server";
import {
  LAUNCH_ID,
  launchDto,
  progressDto,
  useLaunchBackend,
  useLaunchPost,
  WORKSPACE_ID,
} from "./helpers/launch-progress";

const POLL_MS = 20;
const SETTLE_MS = 200;
const ACTIVE_LAUNCH_KEY = `lanzador.activeLaunch.${WORKSPACE_ID}`;

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

function renderWithClient(ui: ReactNode) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/w/w1/hoy"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const renderProgress = () =>
  renderWithClient(
    <ProgressView workspaceId={WORKSPACE_ID} launchId={LAUNCH_ID} />,
  );

const failedChecks: LaunchProgress["checks"] = [
  { ok: false, code: "ADS_PAUSED", text: "Hay anuncios activos" },
];

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.disable());

describe("ProgressView > polling", () => {
  it("polls while nextPollMs is a number and stops when it is null", async () => {
    let call = 0;
    const calls = useLaunchBackend(() =>
      progressDto({
        status: "running",
        nextPollMs: ++call < 3 ? POLL_MS : null,
      }),
    );
    renderProgress();

    await waitFor(() => expect(calls).toHaveBeenCalledTimes(3));
    await settle();

    expect(calls).toHaveBeenCalledTimes(3);
  });

  it("shows the summary and mirrors it in a polite live region", async () => {
    useLaunchBackend(() =>
      progressDto({
        status: "verified_with_errors",
        counts: { total: 20, done: 14, failed: 1 },
      }),
    );
    renderProgress();

    await screen.findByRole("heading", { level: 1 });
    const live = document.querySelector('[aria-live="polite"]');
    expect(screen.getAllByText("14 de 20 listos · 1 con error")).toHaveLength(
      2,
    );
    expect(live?.textContent).toBe("14 de 20 listos · 1 con error");
  });
});

describe("ProgressView > decision", () => {
  it("hides Activar when the checks are not green", async () => {
    useLaunchBackend(() => progressDto({ checks: failedChecks }));
    renderProgress();

    expect(await screen.findByText("Hay anuncios activos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Activar ahora" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Programar" })).toBeNull();
  });

  it("hides Activar when the server sent no checks", async () => {
    useLaunchBackend(() => progressDto({ checks: undefined }));
    renderProgress();

    await screen.findByText("¿Qué hacemos con este lanzamiento?");
    expect(screen.queryByRole("button", { name: "Activar ahora" })).toBeNull();
  });

  it("sends confirm:true to activate only after the receipt is confirmed", async () => {
    useLaunchBackend(() => progressDto());
    const activate = useLaunchPost("activate");
    renderProgress();

    fireEvent.click(
      await screen.findByRole("button", { name: "Activar ahora" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(activate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Activar" }));

    await waitFor(() =>
      expect(activate).toHaveBeenCalledWith({ confirm: true }),
    );
  });

  it("sends startAt as an ISO datetime when scheduling", async () => {
    useLaunchBackend(() => progressDto());
    const activate = useLaunchPost("activate");
    renderProgress();

    fireEvent.click(await screen.findByRole("button", { name: "Programar" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Fecha y hora de inicio/), {
      target: { value: "2099-01-01T10:00" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Programar" }));

    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    expect(activate.mock.calls[0]![0]).toEqual({
      confirm: true,
      startAt: new Date("2099-01-01T10:00").toISOString(),
    });
  });

  it("does not offer Programar when the launch is already scheduled", async () => {
    const startAt = new Date(Date.now() + 3_600_000).toISOString();
    useLaunchBackend(() => progressDto(), launchDto({ startAt }));
    renderProgress();

    await screen.findByRole("button", { name: "Activar" });
    expect(screen.queryByRole("button", { name: "Programar" })).toBeNull();
  });
});

describe("ProgressView > errors", () => {
  it("filters to failed ads and retries them with confirm:true", async () => {
    useLaunchBackend(() =>
      progressDto({
        status: "verified_with_errors",
        counts: { total: 2, done: 1, failed: 1 },
        items: [
          { id: "i1", position: 0, status: "done", adName: "Video uno" },
          {
            id: "i2",
            position: 1,
            status: "failed",
            adName: "Video dos",
            error: "Video inválido",
          },
        ],
      }),
    );
    const retry = useLaunchPost("retry-failed");
    renderProgress();

    expect(await screen.findByText("Video dos")).toBeTruthy();
    expect(screen.queryByText("Video uno")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Solo errores" }).ariaPressed,
    ).toBe("true");

    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar fallidos" }),
    );

    await waitFor(() => expect(retry).toHaveBeenCalledWith({ confirm: true }));
  });
});

describe("LaunchIndicator", () => {
  it("shows the count and refreshes on focus without polling", async () => {
    localStorage.setItem(ACTIVE_LAUNCH_KEY, LAUNCH_ID);
    const calls = useLaunchBackend(() =>
      progressDto({
        status: "running",
        counts: { total: 20, done: 14, failed: 0 },
        nextPollMs: POLL_MS,
      }),
    );
    renderWithClient(<LaunchIndicator workspaceId={WORKSPACE_ID} />);

    expect(await screen.findByText("Lanzando 14/20")).toBeTruthy();
    await settle();
    expect(calls).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
    await settle();
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it("renders nothing and forgets the launch once it finished", async () => {
    localStorage.setItem(ACTIVE_LAUNCH_KEY, LAUNCH_ID);
    const calls = useLaunchBackend(() => progressDto());
    renderWithClient(<LaunchIndicator workspaceId={WORKSPACE_ID} />);

    await waitFor(() => expect(calls).toHaveBeenCalled());
    await waitFor(() =>
      expect(localStorage.getItem(ACTIVE_LAUNCH_KEY)).toBeNull(),
    );
    expect(screen.queryByText(/Lanzando/)).toBeNull();
  });
});
