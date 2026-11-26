import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Me } from "../../src/shared/schemas/auth";
import type {
  AiUsage,
  WorkspaceOverview,
} from "../../src/shared/schemas/workspaces";
import { createQueryClient } from "../../src/web/lib/query-client";
import { appRoutes } from "../../src/web/router";
import { server } from "../helpers/msw/server";

const baseUsage: AiUsage = {
  neuronsToday: 1240,
  dailyCap: 2000,
  neuronsMonth: 8300,
  monthlyCap: 30000,
  globalExhausted: false,
  resetsAt: "2026-01-02T00:00:00.000Z",
};

const overview = (aiUsage: AiUsage): WorkspaceOverview => ({
  workspace: {
    id: "w1",
    name: "Mi negocio",
    planId: "free",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  role: "editor",
  plan: {
    id: "free",
    name: "Free",
    limits: {
      maxMembers: 3,
      maxAdAccounts: 1,
      maxCreativesPerLaunch: 5,
      aiDailyNeurons: 2000,
      aiMonthlyNeurons: 30000,
    },
  },
  settings: {
    maxCampaignBudgetMinor: 5000,
    budgetCurrency: "USD",
    maxScalePercent: 20,
    advantageCreativeEnabled: false,
    timezone: "America/Argentina/Buenos_Aires",
    defaultCountries: ["AR"],
    nameTemplates: {
      campaign: "{producto} | {fecha}",
      adset: "{audiencia}",
      ad: "{creativo}",
    },
    launchDefaults: {},
  },
  aiUsage,
});

const me: Me = {
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
      role: "editor",
      status: "active",
      billingBlocked: false,
    },
  ],
};

function renderPage() {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: ["/w/w1/ajustes/ia"],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function renderUsage(aiUsage: AiUsage) {
  server.use(
    http.get("/api/me", () => HttpResponse.json(me)),
    http.get("/api/w/w1", () => HttpResponse.json(overview(aiUsage))),
  );
  renderPage();
  await screen.findByText(/créditos de IA hoy/);
}

const todayBar = () =>
  screen.getByRole("progressbar", { name: /créditos de IA hoy/ });
const monthBar = () => screen.getByRole("progressbar", { name: /este mes/ });

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Ajustes > IA", () => {
  it("shows the daily and monthly credit usage with both bars", async () => {
    await renderUsage(baseUsage);

    expect(
      screen.getByText("1.240 de 2.000 créditos de IA hoy", {
        selector: "p",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("8.300 de 30.000 este mes", { selector: "p" }),
    ).toBeTruthy();
    expect(todayBar().getAttribute("aria-valuenow")).toBe("62");
    expect(monthBar().getAttribute("aria-valuenow")).toBe("28");
    expect(screen.queryByText(/IA en pausa/)).toBeNull();
  });

  it("keeps both bars neutral below 80 %", async () => {
    await renderUsage({ ...baseUsage, neuronsToday: 1599 });

    expect(todayBar().getAttribute("data-tone")).toBe("primary");
    expect(monthBar().getAttribute("data-tone")).toBe("primary");
  });

  it("turns a bar to warn at 80 % without touching the other", async () => {
    await renderUsage({ ...baseUsage, neuronsToday: 1600 });

    expect(todayBar().getAttribute("data-tone")).toBe("warn");
    expect(monthBar().getAttribute("data-tone")).toBe("primary");
  });

  it("turns the monthly bar to warn at 80 %", async () => {
    await renderUsage({ ...baseUsage, neuronsMonth: 24000 });

    expect(monthBar().getAttribute("data-tone")).toBe("warn");
    expect(todayBar().getAttribute("data-tone")).toBe("primary");
  });

  it("shows the pause notice when the global budget is exhausted", async () => {
    await renderUsage({ ...baseUsage, globalExhausted: true });

    expect((await screen.findByRole("status")).textContent).toBe(
      "IA en pausa hasta las 21 h.",
    );
  });

  it("shows a retryable error when the workspace fails to load", async () => {
    server.use(
      http.get("/api/me", () => HttpResponse.json(me)),
      http.get("/api/w/w1", () =>
        HttpResponse.json(
          {
            error: { code: "FORBIDDEN_ROLE", message: "x", requestId: "req_1" },
          },
          { status: 403 },
        ),
      ),
    );
    renderPage();

    expect(
      await screen.findByText("No pudimos cargar el consumo de IA"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});
