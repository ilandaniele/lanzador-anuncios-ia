import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useState } from "react";
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
import type { PartialLaunchDraft } from "../../src/shared/schemas/launch";
import type { CampaignsResponse } from "../../src/shared/schemas/meta-campaigns";
import { isStructureStepComplete } from "../../src/web/features/launch/structure-completion";
import { createQueryClient } from "../../src/web/lib/query-client";
import { Step2Structure } from "../../src/web/pages/lanzador/Step2Structure";
import { server } from "../helpers/msw/server";

const settings = {
  timezone: "America/Argentina/Buenos_Aires",
  nameTemplates: {
    campaign: "CBO {fecha}",
    adset: "CONJ {n}",
    ad: "{creativo}",
  },
};

const campaigns: CampaignsResponse = {
  data: [
    {
      id: "111",
      name: "Campaña CBO",
      effectiveStatus: "ACTIVE",
      dailyBudgetMinor: 2000,
      objective: "OUTCOME_SALES",
      bidStrategy: "LOWEST_COST_WITHOUT_CAP",
      isCbo: true,
    },
    {
      id: "222",
      name: "Campaña ABO",
      effectiveStatus: "PAUSED",
      dailyBudgetMinor: null,
      objective: "OUTCOME_SALES",
      bidStrategy: null,
      isCbo: false,
    },
  ],
  truncated: false,
};

const reference = {
  adsetName: "CONJ 4",
  optimizationGoal: "OFFSITE_CONVERSIONS",
  customEventType: "PURCHASE",
  pixelId: "pixel_1",
  bidStrategy: "COST_CAP",
  bidAmountMinor: 1500,
  countries: ["AR", "UY"],
  dailyBudgetMinor: 2000,
  nextAdsetNumber: 5,
};

const errorEnvelope = (code: string) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "r1" } },
    { status: 422 },
  );

function useBackend(
  campaignsResponse: CampaignsResponse = campaigns,
  referenceResponse: () => Response = () => HttpResponse.json(reference),
) {
  server.use(
    http.get("/api/w/w1", () => HttpResponse.json({ settings })),
    http.get("/api/w/w1/products/p1", () =>
      HttpResponse.json({ product: { id: "p1", name: "Zapatillas" } }),
    ),
    http.get("/api/w/w1/meta/ad-accounts/a1/campaigns", () =>
      HttpResponse.json(campaignsResponse),
    ),
    http.get("/api/w/w1/meta/campaigns/:campaignId/reference", () =>
      referenceResponse(),
    ),
  );
}

function Harness({
  initial,
  setBlockReason,
  onDraft,
}: {
  initial: PartialLaunchDraft;
  setBlockReason: (reason: string | null) => void;
  onDraft: (draft: PartialLaunchDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  onDraft(draft);
  return (
    <Step2Structure
      workspaceId="w1"
      draft={draft}
      update={(changes) =>
        setDraft((previous) => ({ ...previous, ...changes }))
      }
      setBlockReason={setBlockReason}
    />
  );
}

function renderStep(initial: PartialLaunchDraft = { adAccountAssetId: "a1" }) {
  const setBlockReason = vi.fn();
  const onDraft = vi.fn();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Harness
        initial={initial}
        setBlockReason={setBlockReason}
        onDraft={onDraft}
      />
    </QueryClientProvider>,
  );
  const lastDraft = () => onDraft.mock.lastCall![0] as PartialLaunchDraft;
  return { setBlockReason, lastDraft };
}

async function chooseCampaign(name: string) {
  fireEvent.click(await screen.findByRole("combobox", { name: /^Campaña/ }));
  fireEvent.click(
    await screen.findByRole("option", { name: new RegExp(`^${name}`) }),
  );
}

beforeAll(() => server.enable());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 2, 5, 12, 7));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Lanzador > paso 2", () => {
  it("fills the default templates when choosing CBO nueva", async () => {
    useBackend();
    const { lastDraft } = renderStep();

    fireEvent.click(await screen.findByRole("radio", { name: /CBO nueva/ }));

    expect(lastDraft()).toMatchObject({
      mode: "new_cbo",
      campaignName: "CBO {fecha}",
      adsetName: "CONJ {n}",
    });
    expect(await screen.findByText("Vista previa: CBO 05-03")).toBeTruthy();
    expect(screen.getByText("Vista previa: CONJ 1")).toBeTruthy();
  });

  it("replaces {producto} and {fecha} in the preview", async () => {
    useBackend();
    renderStep({
      adAccountAssetId: "a1",
      productId: "p1",
      mode: "new_cbo",
      campaignName: "{producto} {fecha}",
      adsetName: "CONJ {n}",
    });

    expect(
      await screen.findByText("Vista previa: Zapatillas 05-03"),
    ).toBeTruthy();
  });

  it("inserts a placeholder chip at the end of the name", async () => {
    useBackend();
    const { lastDraft } = renderStep({
      adAccountAssetId: "a1",
      mode: "new_cbo",
      campaignName: "CBO ",
      adsetName: "CONJ",
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Insertar {hora} (Nombre de la campaña)",
      }),
    );

    expect(lastDraft().campaignName).toBe("CBO {hora}");
  });

  it("shows the reference block and next adset number for a CBO campaign", async () => {
    useBackend();
    const { setBlockReason, lastDraft } = renderStep();

    fireEvent.click(
      await screen.findByRole("radio", { name: /Conjunto nuevo en CBO/ }),
    );
    await chooseCampaign("Campaña CBO");

    expect(await screen.findByText("Se copia de CONJ 4")).toBeTruthy();
    expect(screen.getByText("AR, UY")).toBeTruthy();
    expect(screen.getByText("PURCHASE")).toBeTruthy();
    expect(screen.getByText(/Límite de costo/)).toBeTruthy();
    expect(await screen.findByText("Vista previa: CONJ 5")).toBeTruthy();
    expect(lastDraft()).toMatchObject({
      mode: "existing_cbo",
      existingCampaignId: "111",
      campaignName: "Campaña CBO",
    });
    expect(isStructureStepComplete(lastDraft())).toBe(true);
    expect(setBlockReason).not.toHaveBeenCalledWith(expect.any(String));
  });

  it("shows the reason and blocks when the campaign is not CBO", async () => {
    useBackend(campaigns, () => errorEnvelope("NOT_CBO"));
    const { setBlockReason } = renderStep();

    fireEvent.click(
      await screen.findByRole("radio", { name: /Conjunto nuevo en CBO/ }),
    );
    await chooseCampaign("Campaña ABO");

    const reason = "no usa presupuesto a nivel campaña";
    expect((await screen.findByRole("alert")).textContent).toContain(reason);
    await waitFor(() =>
      expect(setBlockReason).toHaveBeenLastCalledWith(
        expect.stringContaining(reason),
      ),
    );
    expect(screen.queryByText(/Se copia de/)).toBeNull();
  });

  it("shows the reason when the campaign has no adset to copy", async () => {
    useBackend(campaigns, () => errorEnvelope("NO_REFERENCE_ADSET"));
    const { setBlockReason } = renderStep();

    fireEvent.click(
      await screen.findByRole("radio", { name: /Conjunto nuevo en CBO/ }),
    );
    await chooseCampaign("Campaña CBO");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "ningún conjunto para copiar",
    );
    await waitFor(() =>
      expect(setBlockReason).toHaveBeenLastCalledWith(
        expect.stringContaining("ningún conjunto para copiar"),
      ),
    );
  });

  it("warns when the campaign list is truncated", async () => {
    useBackend({ ...campaigns, truncated: true });
    renderStep({ adAccountAssetId: "a1", mode: "existing_cbo" });

    expect((await screen.findByRole("status")).textContent).toContain(
      "solo una parte de las campañas",
    );
  });
});

describe("isStructureStepComplete", () => {
  it("needs mode, names and the campaign when using an existing CBO", () => {
    const named = { campaignName: "CBO", adsetName: "CONJ 1" };
    expect(isStructureStepComplete({})).toBe(false);
    expect(isStructureStepComplete({ ...named, mode: "new_cbo" })).toBe(true);
    expect(isStructureStepComplete({ ...named, mode: "existing_cbo" })).toBe(
      false,
    );
    expect(
      isStructureStepComplete({
        ...named,
        mode: "existing_cbo",
        existingCampaignId: "111",
      }),
    ).toBe(true);
  });
});
