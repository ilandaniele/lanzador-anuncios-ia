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
import type { CreativeStatus } from "../../src/shared/schemas/creatives";
import type { PartialLaunchDraft } from "../../src/shared/schemas/launch";
import type {
  CampaignAdsResponse,
  CampaignsResponse,
} from "../../src/shared/schemas/meta-campaigns";
import { isCreativesStepComplete } from "../../src/web/features/launch/creatives-completion";
import { WizardFooter } from "../../src/web/features/launch/WizardFooter";
import type { UploadEnvironment } from "../../src/web/features/uploads/upload-environment";
import { createQueryClient } from "../../src/web/lib/query-client";
import { Step4Creatives } from "../../src/web/pages/lanzador/Step4Creatives";
import { server } from "../helpers/msw/server";
import {
  ACCOUNT_ID,
  creativeDto,
  fakeMedia,
  installUploadBackend,
  makeFile,
} from "./helpers/upload-fakes";

type Items = NonNullable<PartialLaunchDraft["items"]>;

const cloneItem = (adId: string, adName: string): Items[number] => ({
  source: "clone",
  cloneAdId: adId,
  adName,
});

const uploadItem = (creativeId: string, adName: string): Items[number] => ({
  source: "upload",
  creativeId,
  adName,
  mediaKind: "video",
});

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
  ],
  truncated: false,
};

const ads: CampaignAdsResponse = {
  data: [
    {
      adId: "ad1",
      name: "Reel ganador",
      storyId: "story1",
      thumbnailUrl: "https://cdn.example.com/reel.jpg",
      effectiveStatus: "ACTIVE",
      spendMinor: 12345,
      purchases: 9,
      roas: 3.5,
    },
    {
      adId: "ad2",
      name: "Foto sin ventas",
      storyId: null,
      thumbnailUrl: null,
      effectiveStatus: "PAUSED",
      spendMinor: 500,
      purchases: 0,
      roas: null,
    },
  ],
  truncated: false,
};

function useWorkspace(maxCreativesPerLaunch = 30) {
  server.use(
    http.get("/api/w/w1", () =>
      HttpResponse.json({
        workspace: {},
        role: "owner",
        plan: { id: "p", name: "Beta", limits: { maxCreativesPerLaunch } },
        settings: {},
        aiUsage: {},
      }),
    ),
  );
}

function useCreativeStatuses(statuses: CreativeStatus[]) {
  const calls = { polls: 0, urls: [] as string[] };
  server.use(
    http.get("/api/w/w1/creatives", ({ request }) => {
      calls.urls.push(request.url);
      const status = statuses[Math.min(calls.polls, statuses.length - 1)]!;
      calls.polls += 1;
      return HttpResponse.json({
        data: [{ ...creativeDto(status), thumbnailUrl: "https://t/c1.jpg" }],
        nextCursor: null,
      });
    }),
  );
  return calls;
}

function useCampaignAds() {
  const requests: string[] = [];
  server.use(
    http.get(`/api/w/w1/meta/ad-accounts/${ACCOUNT_ID}/campaigns`, () =>
      HttpResponse.json(campaigns),
    ),
    http.get("/api/w/w1/meta/campaigns/111/ads", ({ request }) => {
      requests.push(new URL(request.url).search);
      return HttpResponse.json(ads);
    }),
  );
  return requests;
}

const environment: UploadEnvironment = {
  media: fakeMedia().environment,
  pollIntervalMs: 20,
  retryDelayMs: 0,
};

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
      <Step4Creatives
        workspaceId="w1"
        draft={draft}
        update={(changes) =>
          setDraft((previous) => ({ ...previous, ...changes }))
        }
        setBlockReason={setBlockReason}
        environment={environment}
      />
      <WizardFooter
        saveState="saved"
        onNext={() => undefined}
        nextBlockedReason={
          blockReason ??
          (isCreativesStepComplete(draft) ? undefined : "incompleto")
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
  const names = () => (latest.items ?? []).map(({ adName }) => adName);
  return { lastDraft: () => latest, names };
}

const withAccount = (items: Items = []): PartialLaunchDraft => ({
  adAccountAssetId: ACCOUNT_ID,
  items,
});

const nextButton = () => screen.getByRole("button", { name: "Siguiente" });
const rowNames = () =>
  screen
    .getAllByRole("textbox", { name: /^Nombre del anuncio/ })
    .map((input) => (input as HTMLInputElement).value);

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

describe("Lanzador > paso 4", () => {
  it("reorders with the Subir and Bajar buttons and keeps focus", async () => {
    useWorkspace();
    const { names } = renderStep(
      withAccount([
        cloneItem("a", "Anuncio A"),
        cloneItem("b", "Anuncio B"),
        cloneItem("c", "Anuncio C"),
      ]),
    );

    const down = await screen.findByRole("button", { name: "Bajar Anuncio A" });
    down.focus();
    fireEvent.click(down);

    expect(names()).toEqual(["Anuncio B", "Anuncio A", "Anuncio C"]);
    expect(rowNames()).toEqual(["Anuncio B", "Anuncio A", "Anuncio C"]);
    expect(document.activeElement).toBe(down);

    fireEvent.click(screen.getByRole("button", { name: "Subir Anuncio C" }));
    expect(names()).toEqual(["Anuncio B", "Anuncio C", "Anuncio A"]);
    expect(
      screen
        .getByRole("button", { name: "Subir Anuncio B" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Bajar Anuncio A" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("reorders by dragging a row handle onto another row", async () => {
    useWorkspace();
    const { names } = renderStep(
      withAccount([cloneItem("a", "Anuncio A"), cloneItem("b", "Anuncio B")]),
    );

    const rows = await screen.findAllByRole("listitem");
    fireEvent.dragStart(within(rows[0]!).getByTestId("drag-handle"));
    fireEvent.dragOver(rows[1]!);
    fireEvent.drop(rows[1]!);

    expect(names()).toEqual(["Anuncio B", "Anuncio A"]);
  });

  it("renames on blur, restores an empty name and removes with Quitar", async () => {
    useWorkspace();
    const { names } = renderStep(
      withAccount([cloneItem("a", "Anuncio A"), cloneItem("b", "Anuncio B")]),
    );

    const [first] = await screen.findAllByRole("textbox", {
      name: /^Nombre del anuncio/,
    });
    fireEvent.change(first!, { target: { value: "  Oferta  " } });
    fireEvent.blur(first!);
    expect(names()).toEqual(["Oferta", "Anuncio B"]);

    fireEvent.change(first!, { target: { value: "   " } });
    fireEvent.blur(first!);
    expect(names()).toEqual(["Oferta", "Anuncio B"]);
    expect((first as HTMLInputElement).value).toBe("Oferta");

    fireEvent.click(screen.getByRole("button", { name: "Quitar Oferta" }));
    expect(names()).toEqual(["Anuncio B"]);
  });

  it("shows the counter and blocks Siguiente when empty", async () => {
    useWorkspace(5);
    renderStep(withAccount());

    expect(await screen.findByText("0 de 5 creativos")).toBeTruthy();
    expect(nextButton().getAttribute("aria-disabled")).toBe("true");
  });

  it("shows an error and blocks Siguiente above max_creatives_per_launch", async () => {
    useWorkspace(2);
    renderStep(
      withAccount([
        cloneItem("a", "Anuncio A"),
        cloneItem("b", "Anuncio B"),
        cloneItem("c", "Anuncio C"),
      ]),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Superaste el máximo de creativos por lanzamiento",
    );
    expect(screen.getByText("3 de 2 creativos")).toBeTruthy();
    await waitFor(() =>
      expect(nextButton().getAttribute("aria-disabled")).toBe("true"),
    );
  });

  it("re-fetches a processing creative until it is ready", async () => {
    useWorkspace();
    const calls = useCreativeStatuses(["processing", "processing", "ready"]);
    renderStep(withAccount([uploadItem("c1", "Video 1")]));

    expect(await screen.findByText("Procesando en Meta")).toBeTruthy();
    await waitFor(() =>
      expect(nextButton().getAttribute("aria-disabled")).toBe("true"),
    );
    expect(
      screen.getAllByText(/Esperá a que Meta termine/).length,
    ).toBeGreaterThan(0);

    expect(await screen.findByText("Listo")).toBeTruthy();
    expect(calls.polls).toBe(3);
    expect(calls.urls[0]).toContain("ids=c1");
    await waitFor(() =>
      expect(nextButton().getAttribute("aria-disabled")).toBeNull(),
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls.polls).toBe(3);
  });

  it("flags a failed creative and asks to remove it", async () => {
    useWorkspace();
    useCreativeStatuses(["failed"]);
    renderStep(withAccount([uploadItem("c1", "Video 1")]));

    expect(
      await screen.findByText("Meta no pudo procesar este creativo"),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/Quitá los creativos que fallaron/).length,
    ).toBeGreaterThan(0);
    expect(nextButton().getAttribute("aria-disabled")).toBe("true");
  });

  it("copies ads from another campaign with thumbnail, spend and ROAS", async () => {
    useWorkspace();
    const requests = useCampaignAds();
    const { lastDraft } = renderStep(withAccount());

    fireEvent.click(
      await screen.findByRole("tab", { name: "Copiar de otra campaña" }),
    );
    fireEvent.click(await screen.findByRole("combobox", { name: /^Campaña/ }));
    fireEvent.click(
      await screen.findByRole("option", { name: /^Campaña CBO/ }),
    );

    const reel = await screen.findByRole("checkbox", {
      name: /Reel ganador/,
    });
    expect(requests[0]).toContain(`adAccountAssetId=${ACCOUNT_ID}`);
    const row = reel.closest("label")!;
    expect(row.textContent).toContain("123,45");
    expect(row.textContent).toContain("3,50");
    expect(row.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/reel.jpg",
    );
    expect(
      screen
        .getByRole("checkbox", { name: /Foto sin ventas/ })
        .closest("label")!.textContent,
    ).toContain("—");

    fireEvent.click(reel);
    expect(lastDraft().items).toEqual([
      {
        source: "clone",
        cloneAdId: "ad1",
        cloneStoryId: "story1",
        adName: "Reel ganador",
      },
    ]);
    expect((reel as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByText("Copiado de otra campaña").length).toBe(1);

    fireEvent.click(reel);
    expect(lastDraft().items).toEqual([]);
  });

  it("asks for the ad account before copying ads", async () => {
    useWorkspace();
    renderStep({ items: [] });

    fireEvent.click(
      await screen.findByRole("tab", { name: "Copiar de otra campaña" }),
    );

    expect(
      screen.getByText(/Elegí la cuenta publicitaria en el paso 1/),
    ).toBeTruthy();
  });

  it("offers Conectar Google in the Google Drive tab without a connection", async () => {
    useWorkspace();
    server.use(
      http.get("/api/w/w1/google/connection", () =>
        HttpResponse.json({ connected: false, email: null, status: null }),
      ),
    );
    renderStep(withAccount());

    fireEvent.click(await screen.findByRole("tab", { name: "Google Drive" }));

    expect(
      await screen.findByRole("button", { name: "Conectar Google" }),
    ).toBeTruthy();
  });

  it("moves between tabs with the arrow keys", async () => {
    useWorkspace();
    renderStep(withAccount());

    const upload = await screen.findByRole("tab", { name: "Subir" });
    expect(upload.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(upload, { key: "ArrowRight" });

    const copy = screen.getByRole("tab", { name: "Copiar de otra campaña" });
    expect(copy.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(copy);
  });

  it("adds an uploaded creative once it is ready", async () => {
    useWorkspace();
    installUploadBackend({ completeStatus: "ready" });
    const { lastDraft } = renderStep(withAccount());

    const picker = await screen.findByLabelText(/No cierres esta pestaña/);
    fireEvent.change(picker, { target: { files: [makeFile(1024)] } });

    await waitFor(() =>
      expect(lastDraft().items).toEqual([
        {
          source: "upload",
          creativeId: "c1",
          adName: "anuncio",
          mediaKind: "video",
        },
      ]),
    );
    expect(await screen.findByText("1 de 30 creativos")).toBeTruthy();
  });

  it("does not mix an uploaded video into a list of images", async () => {
    useWorkspace();
    installUploadBackend({ completeStatus: "ready" });
    const { lastDraft } = renderStep(
      withAccount([{ ...uploadItem("img1", "Foto"), mediaKind: "image" }]),
    );

    const picker = await screen.findByLabelText(/No cierres esta pestaña/);
    fireEvent.change(picker, { target: { files: [makeFile(1024)] } });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No se pueden mezclar videos e imágenes",
    );
    expect(lastDraft().items).toHaveLength(1);
  });

  it("disables the dropzone until the account is chosen", async () => {
    useWorkspace();
    renderStep({ items: [] });

    const picker = await screen.findByLabelText(/No cierres esta pestaña/);
    expect((picker as HTMLInputElement).disabled).toBe(true);
  });
});
