import type { MetricsRowDto } from "../../../shared/schemas/metrics";
import {
  WRITABLE_STATUSES,
  type ObjectStatusRequest,
} from "../../../shared/schemas/meta-actions";

type WritableStatus = (typeof WRITABLE_STATUSES)[number];

export type ActionableRow = MetricsRowDto & {
  level: ObjectStatusRequest["level"];
};
export type ScalableRow = ActionableRow & { dailyBudgetMinor: number };

export const isActionable = (row: MetricsRowDto): row is ActionableRow =>
  row.level !== "account";

export const isScalable = (row: ActionableRow): row is ScalableRow =>
  row.level === "campaign" && row.dailyBudgetMinor !== undefined;

export const isWritableStatus = (
  status: string | null,
): status is WritableStatus =>
  WRITABLE_STATUSES.some((writable) => writable === status);

export const oppositeStatus = (status: WritableStatus): WritableStatus =>
  status === "PAUSED" ? "ACTIVE" : "PAUSED";
