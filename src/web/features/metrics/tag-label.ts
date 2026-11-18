import type { TagDimension } from "../../../shared/schemas/metrics";
import { t } from "../../i18n/es-AR";

export const tagLabel = (dimension: TagDimension, tag: string) =>
  dimension !== "onScreenText"
    ? tag
    : t(
        tag === "true"
          ? "metrics.winning.onScreenTextYes"
          : "metrics.winning.onScreenTextNo",
      );
