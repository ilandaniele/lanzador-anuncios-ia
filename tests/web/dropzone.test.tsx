import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Dropzone } from "../../src/web/features/uploads/Dropzone";
import type { UploadEnvironment } from "../../src/web/features/uploads/upload-environment";
import { createQueryClient } from "../../src/web/lib/query-client";
import { server } from "../helpers/msw/server";
import {
  ACCOUNT_ID,
  fakeMedia,
  installUploadBackend,
  makeFile,
  MIB,
  WORKSPACE_ID,
  type UploadBackendOptions,
} from "./helpers/upload-fakes";

beforeAll(() => server.enable());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.disable());

function renderDropzone(
  adAccountAssetId: string | null = ACCOUNT_ID,
  options?: UploadBackendOptions,
) {
  const calls = installUploadBackend(options);
  const media = fakeMedia();
  const environment: UploadEnvironment = {
    media: media.environment,
    pollIntervalMs: 10,
    retryDelayMs: 0,
  };
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Dropzone
        workspaceId={WORKSPACE_ID}
        adAccountAssetId={adAccountAssetId}
        environment={environment}
      />
    </QueryClientProvider>,
  );
  const picker = screen.getByLabelText(/No cierres esta pestaña/);
  const pick = (file: File) =>
    fireEvent.change(picker, { target: { files: [file] } });
  return { calls, media, picker, pick };
}

describe("Dropzone", () => {
  it("is disabled until an ad account is chosen", () => {
    const { picker } = renderDropzone(null);

    expect((picker as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByText("Elegí la cuenta publicitaria para subir"),
    ).toBeTruthy();
    expect(
      screen.getByText("No cierres esta pestaña mientras sube"),
    ).toBeTruthy();
  });

  it("is enabled with an ad account and shows the keep-open notice", () => {
    const { picker } = renderDropzone();

    expect((picker as HTMLInputElement).disabled).toBe(false);
    expect(
      screen.getByText("Arrastrá videos o imágenes, o elegí archivos"),
    ).toBeTruthy();
  });

  it("rejects unsupported files with the file name and reason", () => {
    renderDropzone();
    const target = screen.getByText(
      "Arrastrá videos o imágenes, o elegí archivos",
    );

    fireEvent.drop(target, {
      dataTransfer: { files: [makeFile(10, "tienda.pdf", "application/pdf")] },
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "tienda.pdf no es video ni imagen",
    );
  });

  it("shows Procesando en Meta after complete until the creative is ready", async () => {
    const { calls, media, pick } = renderDropzone(ACCOUNT_ID, {
      statusPolls: ["processing", "processing", "ready"],
    });

    pick(makeFile(25 * MIB));

    expect(await screen.findByText("Procesando en Meta")).toBeTruthy();
    expect(await screen.findByText("Listo")).toBeTruthy();
    expect(screen.queryByText("Procesando en Meta")).toBeNull();
    expect(calls.completed).toBe(1);
    expect(calls.tagged).toHaveLength(1);
    expect(media.released).toBe(1);
  });

  it("shows the retry hint and uploaded progress while uploading", async () => {
    let releaseChunks = () => {};
    const { pick } = renderDropzone(ACCOUNT_ID, {
      holdChunks: new Promise<void>((resolve) => {
        releaseChunks = resolve;
      }),
    });

    pick(makeFile(25 * MIB));

    const bar = await screen.findByRole("progressbar", { name: "anuncio.mp4" });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    releaseChunks();
    await screen.findByText("Procesando en Meta");
  });

  it("cancel calls abort and removes the row", async () => {
    const hold = new Promise<void>(() => {});
    const { calls, pick } = renderDropzone(ACCOUNT_ID, { holdChunks: hold });

    pick(makeFile(25 * MIB));
    await waitFor(() => expect(calls.chunks).toHaveLength(1));
    fireEvent.click(
      screen.getByRole("button", { name: /Cancelar anuncio.mp4/ }),
    );

    await waitFor(() => expect(calls.aborted).toBe(1));
    expect(screen.queryByText("anuncio.mp4")).toBeNull();
    expect(calls.completed).toBe(0);
  });

  it("offers Volver a subir after a failure and re-sends the file", async () => {
    const { calls, pick } = renderDropzone(ACCOUNT_ID, {
      failChunkStarts: [0, 0, 0, 0],
    });

    pick(makeFile(MIB));
    fireEvent.click(
      await screen.findByRole("button", { name: /Volver a subir/ }),
    );

    expect(await screen.findByText("Procesando en Meta")).toBeTruthy();
    expect(calls.created).toHaveLength(2);
    expect(calls.aborted).toBe(1);
    expect(calls.completed).toBe(1);
  });
});
