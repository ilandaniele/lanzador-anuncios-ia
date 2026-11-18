import type { CreativeKind } from "../../../shared/schemas/creatives";
import type {
  DecodedMedia,
  MediaEnvironment,
  SheetCanvas,
} from "./contact-sheet";

const MS_PER_SECOND = 1000;
const SHEET_BACKGROUND = "#ffffff";
const DECODE_TIMEOUT_MS = 15000;

function waitFor(target: HTMLMediaElement | HTMLImageElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true });
    target.addEventListener("error", () => reject(new Error("MEDIA_DECODE")), {
      once: true,
    });
  });
}

async function decodeImage(url: string, release: () => void) {
  const image = new Image();
  const loaded = waitFor(image, "load");
  image.src = url;
  await loaded;
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    durationMs: null,
    frameAt: async () => image,
    release,
  };
}

async function decodeVideo(url: string, release: () => void) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  const loaded = waitFor(video, "loadedmetadata");
  video.src = url;
  await loaded;

  async function frameAt(timeMs: number) {
    const target = timeMs / MS_PER_SECOND;
    if (video.currentTime !== target) {
      const seeked = waitFor(video, "seeked");
      video.currentTime = target;
      await seeked;
    }
    return video;
  }

  return {
    width: video.videoWidth,
    height: video.videoHeight,
    durationMs: Math.round(video.duration * MS_PER_SECOND),
    frameAt,
    release,
  };
}

const decodeTimeout = () =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("MEDIA_DECODE")), DECODE_TIMEOUT_MS),
  );

async function loadMedia(
  file: File,
  kind: CreativeKind,
): Promise<DecodedMedia> {
  const url = URL.createObjectURL(file);
  const release = () => URL.revokeObjectURL(url);
  const decode = kind === "video" ? decodeVideo : decodeImage;
  try {
    return await Promise.race([decode(url, release), decodeTimeout()]);
  } catch (error) {
    release();
    throw error;
  }
}

function createCanvas(width: number, height: number): SheetCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = SHEET_BACKGROUND;
  context.fillRect(0, 0, width, height);
  return {
    drawImage: (source, x, y, w, h) => context.drawImage(source, x, y, w, h),
    toJpeg: (quality) =>
      new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("CANVAS_ENCODE"))),
          "image/jpeg",
          quality,
        ),
      ),
  };
}

export const browserMedia: MediaEnvironment = { loadMedia, createCanvas };
