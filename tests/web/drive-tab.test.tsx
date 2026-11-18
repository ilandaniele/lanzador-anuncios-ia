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
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { CreativeStatus } from "../../src/shared/schemas/creatives";
import type { PartialLaunchDraft } from "../../src/shared/schemas/launch";
import type {
  GooglePicker,
  PickerDocument,
} from "../../src/web/features/google/picker";
import type { UploadEnvironment } from "../../src/web/features/uploads/upload-environment";
import { createQueryClient } from "../../src/web/lib/query-client";
import { Step4Creatives } from "../../src/web/pages/lanzador/Step4Creatives";
import { server } from "../helpers/msw/server";
import { ACCOUNT_ID, creativeDto, fakeMedia } from "./helpers/upload-fakes";

const FOLDER_ID = "1AbCdEfGhIjKlMnOpQrStUv";
const FOLDER_LINK = `https://drive.google.com/drive/folders/${FOLDER_ID}?usp=sharing`;

const environment: UploadEnvironment = {
  media: fakeMedia().environment,
  pollIntervalMs: 20,
  retryDelayMs: 0,
};

const pickedDocument: PickerDocument = {
  id: "file_id_0001",
  name: "reel.mp4",
  mimeType: "video/mp4",
  sizeBytes: 2048,
};

type PickerCallback = Parameters<
  InstanceType<GooglePicker["PickerBuilder"]>["setCallback"]
>[0];

function installPickerStub(docs: PickerDocument[] = [pickedDocument]) {
  const setParent = vi.fn();
  class DocsView {
    setParent(folderId: string) {
      setParent(folderId);
      return this;
    }
    setMimeTypes() {
      return this;
    }
    setIncludeFolders() {
      return this;
    }
  }
  class PickerBuilder {
    private callback: PickerCallback = () => undefined;
    addView() {
      return this;
    }
    setOAuthToken() {
      return this;
    }
    setDeveloperKey() {
      return this;
    }
    setAppId() {
      return this;
    }
    setLocale() {
      return this;
    }
    setMaxItems() {
      return this;
    }
    enableFeature() {
      return this;
    }
    setCallback(callback: PickerCallback) {
      this.callback = callback;
      return this;
    }
    build() {
      return {
        setVisible: () => {
          this.callback({ action: "picked", docs });
          return this;
        },
      };
    }
  }
  window.google = {
    picker: {
      DocsView,
      PickerBuilder,
      ViewId: { DOCS: "docs" },
      Feature: { MULTISELECT_ENABLED: "multiselect" },
      Action: { PICKED: "picked", CANCEL: "cancel" },
    } as unknown as GooglePicker,
  };
  return { setParent };
}

function useDriveBackend(statuses: CreativeStatus[] = ["ready"]) {
  const calls = { imports: [] as unknown[], polls: 0 };
  server.use(
    http.get("/api/w/w1", () =>
      HttpResponse.json({
        workspace: {},
        role: "owner",
        plan: { id: "p", name: "Beta", limits: { maxCreativesPerLaunch: 30 } },
        settings: {},
        aiUsage: {},
      }),
    ),
    http.get("/api/w/w1/google/connection", () =>
      HttpResponse.json({
        connected: true,
        email: "ana@example.com",
        status: "active",
      }),
    ),
    http.get("/api/w/w1/google/picker-token", () =>
      HttpResponse.json({
        accessToken: "token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        apiKey: "key",
        appId: "123",
      }),
    ),
    http.post("/api/w/w1/google/imports", async ({ request }) => {
      calls.imports.push(await request.json());
      return HttpResponse.json(
        { data: [{ creativeId: "c1", status: "importing" }] },
        { status: 202 },
      );
    }),
    http.get("/api/w/w1/creatives", () => {
      const status = statuses[Math.min(calls.polls, statuses.length - 1)]!;
      calls.polls += 1;
      return HttpResponse.json({
        data: [creativeDto(status)],
        nextCursor: null,
      });
    }),
  );
  return calls;
}

function Harness({ initial }: { initial: PartialLaunchDraft }) {
  const [draft, setDraft] = useState(initial);
  return (
    <Step4Creatives
      workspaceId="w1"
      draft={draft}
      update={(changes) =>
        setDraft((previous) => ({ ...previous, ...changes }))
      }
      setBlockReason={() => undefined}
      environment={environment}
    />
  );
}

async function openDriveTab(initial: PartialLaunchDraft = {}) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Harness initial={{ adAccountAssetId: ACCOUNT_ID, ...initial }} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("tab", { name: "Google Drive" }));
  return screen.findByRole("button", { name: "Elegir de Drive" });
}

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  delete window.google;
});
afterAll(() => server.disable());

describe("Lanzador > paso 4 > Google Drive", () => {
  it("opens the picker on the pasted folder and sends the ad account", async () => {
    const { setParent } = installPickerStub();
    const calls = useDriveBackend();
    const choose = await openDriveTab();

    fireEvent.change(screen.getByLabelText(/Link de la carpeta de Drive/), {
      target: { value: FOLDER_LINK },
    });
    fireEvent.click(choose);

    await waitFor(() => expect(calls.imports).toHaveLength(1));
    expect(setParent).toHaveBeenCalledWith(FOLDER_ID);
    expect(calls.imports[0]).toEqual({
      adAccountAssetId: ACCOUNT_ID,
      files: [
        {
          id: pickedDocument.id,
          name: pickedDocument.name,
          mimeType: pickedDocument.mimeType,
          sizeBytes: pickedDocument.sizeBytes,
        },
      ],
    });
    expect(
      await screen.findByRole("textbox", { name: /^Nombre del anuncio/ }),
    ).toHaveProperty("value", "reel.mp4");
  });

  it("starts from the driveFolderHint when it is a folder link", async () => {
    const { setParent } = installPickerStub();
    const calls = useDriveBackend();
    const choose = await openDriveTab({ driveFolderHint: FOLDER_LINK });

    fireEvent.click(choose);

    await waitFor(() => expect(calls.imports).toHaveLength(1));
    expect(setParent).toHaveBeenCalledWith(FOLDER_ID);
  });

  it("opens the picker without a parent when the link is not a folder", async () => {
    const { setParent } = installPickerStub();
    const calls = useDriveBackend();
    const choose = await openDriveTab({ driveFolderHint: "carpeta de verano" });

    expect(screen.getByText(/No reconocemos ese link/)).toBeTruthy();
    fireEvent.click(choose);

    await waitFor(() => expect(calls.imports).toHaveLength(1));
    expect(setParent).not.toHaveBeenCalled();
  });

  it("polls the imported creatives until none is importing or processing", async () => {
    installPickerStub();
    const calls = useDriveBackend(["importing", "processing", "ready"]);
    const choose = await openDriveTab();

    fireEvent.click(choose);

    expect(await screen.findByText(/Importando desde Drive: 1/)).toBeTruthy();
    await waitFor(() => expect(calls.polls).toBeGreaterThanOrEqual(3));
    await waitFor(() =>
      expect(screen.queryByText(/Importando desde Drive/)).toBeNull(),
    );
    const settled = calls.polls;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(calls.polls).toBe(settled);
  });

  it("shows a message when the in-flight import cap is reached", async () => {
    installPickerStub();
    useDriveBackend();
    server.use(
      http.post("/api/w/w1/google/imports", () =>
        HttpResponse.json(
          { error: { code: "RATE_LIMITED", message: "x", requestId: "r1" } },
          { status: 429 },
        ),
      ),
    );
    const choose = await openDriveTab();

    fireEvent.click(choose);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Hay muchas importaciones en curso",
    );
  });
});
