import type { CreativeDto } from "../../../shared/schemas/creatives";
import { isMetaInProgressStatus } from "../uploads/upload-item";

export type CreativeState = "ready" | "processing" | "unavailable";

export const creativeState = ({ status }: CreativeDto): CreativeState =>
  status === "ready"
    ? "ready"
    : isMetaInProgressStatus(status)
      ? "processing"
      : "unavailable";
