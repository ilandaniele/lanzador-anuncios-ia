import { FILE_LIMITS } from "../../../shared/constants";
import type { CreativeKind } from "../../../shared/schemas/creatives";

const SHEET_WIDTH = 1200;
const IMAGE_MAX_EDGE = 1024;
const VIDEO_FRAME_POSITIONS = [0.2, 0.5, 0.8];
const JPEG_QUALITIES = [0.85, 0.7, 0.55, 0.4, 0.25];

export interface DecodedMedia {
  width: number;
  height: number;
  durationMs: number | null;
  frameAt(timeMs: number): Promise<CanvasImageSource>;
  release(): void;
}

export interface SheetCanvas {
  drawImage(
    source: CanvasImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void;
  toJpeg(quality: number): Promise<Blob>;
}

export interface MediaEnvironment {
  loadMedia(file: File, kind: CreativeKind): Promise<DecodedMedia>;
  createCanvas(width: number, height: number): SheetCanvas;
}

interface SheetCell {
  timeMs: number;
  x: number;
  width: number;
  height: number;
}

interface SheetLayout {
  width: number;
  height: number;
  cells: SheetCell[];
}

function imageLayout({ width, height }: DecodedMedia): SheetLayout {
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(width, height));
  const scaled = {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
  return { ...scaled, cells: [{ timeMs: 0, x: 0, ...scaled }] };
}

function videoLayout({ width, height, durationMs }: DecodedMedia): SheetLayout {
  const cellWidth = Math.floor(SHEET_WIDTH / VIDEO_FRAME_POSITIONS.length);
  const cellHeight = Math.round((cellWidth * height) / width);
  return {
    width: cellWidth * VIDEO_FRAME_POSITIONS.length,
    height: cellHeight,
    cells: VIDEO_FRAME_POSITIONS.map((position, index) => ({
      timeMs: Math.round((durationMs ?? 0) * position),
      x: index * cellWidth,
      width: cellWidth,
      height: cellHeight,
    })),
  };
}

async function encodeUnderLimit(canvas: SheetCanvas): Promise<Blob> {
  for (const quality of JPEG_QUALITIES) {
    const sheet = await canvas.toJpeg(quality);
    if (sheet.size <= FILE_LIMITS.contactSheetMaxBytes) return sheet;
  }
  throw new Error("CONTACT_SHEET_TOO_LARGE");
}

export async function buildContactSheet(
  media: DecodedMedia,
  kind: CreativeKind,
  environment: Pick<MediaEnvironment, "createCanvas">,
): Promise<Blob> {
  const layout = kind === "video" ? videoLayout(media) : imageLayout(media);
  const canvas = environment.createCanvas(layout.width, layout.height);
  for (const cell of layout.cells) {
    const frame = await media.frameAt(cell.timeMs);
    canvas.drawImage(frame, cell.x, 0, cell.width, cell.height);
  }
  return encodeUnderLimit(canvas);
}
