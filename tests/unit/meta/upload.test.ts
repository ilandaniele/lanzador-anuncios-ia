import { afterEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_TIMEOUT_MS } from "../../../src/api/integrations/meta/client";
import {
  finishVideoUpload,
  readVideoStatus,
  readVideoThumbnail,
  startVideoUpload,
  transferVideoChunk,
  uploadImage,
} from "../../../src/api/integrations/meta/upload";
import {
  captureRequests,
  envelope,
  expectedProof,
  graph,
  rejection,
  TOKEN,
} from "../../helpers/meta-graph";
import {
  graphUrl,
  graphVideoUrl,
  metaReplies,
  metaVideoPhases,
} from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const ACT = "act_1";
const SESSION = "upload_session_1";

const bytesStream = (bytes: Uint8Array) => new Blob([bytes]).stream();

const chunkOf = (size: number) =>
  Uint8Array.from({ length: size }, (_, i) => i % 256);

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

describe("startVideoUpload", () => {
  it("opens a session on graph-video with file_size and returns numeric offsets", async () => {
    server.use(
      metaVideoPhases(`${ACT}/advideos`, {
        start: {
          upload_session_id: SESSION,
          video_id: "vid_1",
          start_offset: "0",
          end_offset: "1048576",
        },
      }),
    );
    const requests = captureRequests();

    const session = await startVideoUpload(graph(), ACT, 52_428_800);

    expect(session).toEqual({
      sessionId: SESSION,
      videoId: "vid_1",
      startOffset: 0,
      endOffset: 1_048_576,
    });
    const [request] = requests;
    expect(request!.url.startsWith(graphVideoUrl(`${ACT}/advideos`))).toBe(
      true,
    );
    const form = await request!.formData();
    expect(form.get("upload_phase")).toBe("start");
    expect(form.get("file_size")).toBe("52428800");
    expect(form.get("appsecret_proof")).toBe(await expectedProof());
    expect(request!.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(request!.url).not.toContain(TOKEN);
  });
});

describe("transferVideoChunk", () => {
  const transfer = (startOffset: number, endOffset: number) =>
    metaVideoPhases(`${ACT}/advideos`, {
      transfer: {
        start_offset: String(startOffset),
        end_offset: String(endOffset),
      },
    });

  it("streams the chunk as multipart with upload_session_id and start_offset", async () => {
    server.use(transfer(4096, 8192));
    const requests = captureRequests();
    const chunk = chunkOf(4096);

    const offsets = await transferVideoChunk(
      graph(),
      ACT,
      SESSION,
      0,
      bytesStream(chunk),
      chunk.length,
    );

    expect(offsets).toEqual({ startOffset: 4096, endOffset: 8192 });
    const [request] = requests;
    expect(request!.url.startsWith(graphVideoUrl(`${ACT}/advideos`))).toBe(
      true,
    );
    expect(request!.headers.get("Content-Type")).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    expect(request!.url).not.toContain(TOKEN);
    const form = await request!.formData();
    expect(form.get("upload_phase")).toBe("transfer");
    expect(form.get("upload_session_id")).toBe(SESSION);
    expect(form.get("start_offset")).toBe("0");
    expect(form.get("appsecret_proof")).toBe(await expectedProof());
    const sent = form.get("video_file_chunk") as unknown as File;
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(chunk);
  });

  it("returns Meta offsets when end_offset is smaller than the chunk sent", async () => {
    server.use(transfer(1024, 2048));
    const chunk = chunkOf(4096);

    const offsets = await transferVideoChunk(
      graph(),
      ACT,
      SESSION,
      0,
      bytesStream(chunk),
      chunk.length,
    );

    expect(offsets).toEqual({ startOffset: 1024, endOffset: 2048 });
  });

  it("uses the 120 s upload timeout", async () => {
    server.use(transfer(1, 1));
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await transferVideoChunk(
      graph(),
      ACT,
      SESSION,
      0,
      bytesStream(chunkOf(1)),
      1,
    );

    expect(timeout).toHaveBeenCalledWith(UPLOAD_TIMEOUT_MS);
  });

  it("classifies Meta errors", async () => {
    server.use(
      metaVideoPhases(
        `${ACT}/advideos`,
        { transfer: envelope({ code: 100, error_subcode: 1363019 }) },
        400,
      ),
    );

    const error = await rejection(
      transferVideoChunk(graph(), ACT, SESSION, 0, bytesStream(chunkOf(8)), 8),
    );

    expect(error.kind).toBe("param");
    expect(error.code).toBe(100);
  });

  it("rejects a malformed Meta reply", async () => {
    server.use(
      metaVideoPhases(`${ACT}/advideos`, { transfer: { start_offset: "x" } }),
    );

    const error = await rejection(
      transferVideoChunk(graph(), ACT, SESSION, 0, bytesStream(chunkOf(8)), 8),
    );

    expect(error.kind).toBe("transient");
  });
});

describe("finishVideoUpload", () => {
  it("finishes the session with its title", async () => {
    server.use(
      metaVideoPhases(`${ACT}/advideos`, { finish: { success: true } }),
    );
    const requests = captureRequests();

    await finishVideoUpload(graph(), ACT, SESSION, "Video 1");

    const form = await requests[0]!.formData();
    expect(form.get("upload_phase")).toBe("finish");
    expect(form.get("upload_session_id")).toBe(SESSION);
    expect(form.get("title")).toBe("Video 1");
  });

  it("fails when Meta does not confirm", async () => {
    server.use(
      metaVideoPhases(`${ACT}/advideos`, { finish: { success: false } }),
    );

    const error = await rejection(
      finishVideoUpload(graph(), ACT, SESSION, "Video 1"),
    );

    expect(error.kind).toBe("transient");
  });
});

describe("uploadImage", () => {
  it("streams the image to adimages and returns hash and url", async () => {
    server.use(
      metaReplies(`${ACT}/adimages`, {
        images: {
          "foto.png": { hash: "abc123", url: "https://scontent.fbcdn.net/x" },
        },
      }),
    );
    const requests = captureRequests();
    const image = chunkOf(2048);

    const result = await uploadImage(
      graph(),
      ACT,
      "foto.png",
      bytesStream(image),
      image.length,
    );

    expect(result).toEqual({
      hash: "abc123",
      url: "https://scontent.fbcdn.net/x",
    });
    const [request] = requests;
    expect(request!.url.startsWith(graphUrl(`${ACT}/adimages`))).toBe(true);
    const form = await request!.formData();
    const sent = form.get("filename") as unknown as File;
    expect(sent.name).toBe("foto.png");
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(image);
    expect(form.get("appsecret_proof")).toBe(await expectedProof());
  });
});

describe("readVideoStatus", () => {
  const replyStatus = (body: Record<string, unknown>) =>
    server.use(metaReplies("vid_1", { id: "vid_1", ...body }));

  it("reads status and format of the largest rendition", async () => {
    replyStatus({
      status: { video_status: "ready" },
      format: [
        { filter: "130x130", width: 130, height: 130 },
        { filter: "native", width: 1080, height: 1920 },
        { filter: "720x720", width: 405, height: 720 },
      ],
    });
    const requests = captureRequests();

    const status = await readVideoStatus(graph(), "vid_1");

    expect(status).toEqual({ status: "ready", width: 1080, height: 1920 });
    expect(new URL(requests[0]!.url).searchParams.get("fields")).toBe(
      "status,format",
    );
  });

  it.each([
    ["processing", "processing"],
    ["error", "error"],
    ["upload_complete", "processing"],
  ])("maps video_status %s to %s", async (videoStatus, expected) => {
    replyStatus({ status: { video_status: videoStatus } });

    const status = await readVideoStatus(graph(), "vid_1");

    expect(status).toEqual({ status: expected });
  });
});

describe("readVideoThumbnail", () => {
  const thumbnails = (data: unknown[]) =>
    server.use(metaReplies("vid_1/thumbnails", { data }));

  it("prefers the preferred thumbnail", async () => {
    thumbnails([
      { uri: "https://scontent.fbcdn.net/a", is_preferred: false },
      { uri: "https://scontent.fbcdn.net/b", is_preferred: true },
    ]);

    expect(await readVideoThumbnail(graph(), "vid_1")).toBe(
      "https://scontent.fbcdn.net/b",
    );
  });

  it("falls back to the first thumbnail", async () => {
    thumbnails([{ uri: "https://scontent.fbcdn.net/a" }]);

    expect(await readVideoThumbnail(graph(), "vid_1")).toBe(
      "https://scontent.fbcdn.net/a",
    );
  });

  it("returns null when Meta has none yet", async () => {
    thumbnails([]);

    expect(await readVideoThumbnail(graph(), "vid_1")).toBeNull();
  });
});
