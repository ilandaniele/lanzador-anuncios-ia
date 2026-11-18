import { browserMedia } from "./browser-media";
import type { MediaEnvironment } from "./contact-sheet";
import { CREATIVE_POLL_MS } from "./use-creative-statuses";

export interface UploadEnvironment {
  media: MediaEnvironment;
  pollIntervalMs: number;
  retryDelayMs?: number;
}

export const browserEnvironment: UploadEnvironment = {
  media: browserMedia,
  pollIntervalMs: CREATIVE_POLL_MS,
};
