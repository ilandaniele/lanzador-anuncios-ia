import { RETRYABLE_LAUNCH_STATUSES } from "../../../shared/launch-status";
import type {
  LaunchItemStatus,
  LaunchProgress,
  LaunchStatus,
} from "../../../shared/schemas/launch";
import type { StatusTone } from "../../components/Chip";
import { t } from "../../i18n/es-AR";

type ProgressItem = LaunchProgress["items"][number];

const DECISION_STATUSES: readonly LaunchStatus[] = [
  "paused_verified",
  "verified_with_errors",
];

const ITEM_TONE: Record<LaunchItemStatus, StatusTone> = {
  pending: "paused",
  processing_media: "progress",
  creating_creative: "progress",
  creating_ad: "progress",
  done: "ready",
  failed: "error",
};

export const itemTone = (status: LaunchItemStatus) => ITEM_TONE[status];

export const itemLabel = (status: LaunchItemStatus) =>
  t(`launchProgress.itemStatus.${status}`);

export const statusLabel = (status: LaunchStatus) =>
  t(`launchProgress.status.${status}`);

export const checksAreGreen = ({ checks }: LaunchProgress) =>
  checks !== undefined && checks.length > 0 && checks.every(({ ok }) => ok);

export const failedChecks = ({ checks = [] }: LaunchProgress) =>
  checks.filter(({ ok }) => !ok);

export const isDecisionStage = ({ status }: LaunchProgress) =>
  DECISION_STATUSES.includes(status);

export const canRetry = ({ status, counts }: LaunchProgress) =>
  counts.failed > 0 && RETRYABLE_LAUNCH_STATUSES.includes(status);

export const isFinished = ({ nextPollMs }: LaunchProgress) =>
  nextPollMs === null;

export const visibleItems = (items: ProgressItem[], onlyErrors: boolean) =>
  onlyErrors ? items.filter(({ status }) => status === "failed") : items;

export function summaryText({ counts }: LaunchProgress): string {
  const base = `${counts.done} ${t("launchProgress.summaryOf")} ${counts.total} ${t("launchProgress.summaryReady")}`;
  return counts.failed > 0
    ? `${base} · ${counts.failed} ${t("launchProgress.summaryWithError")}`
    : base;
}

export type BarSegment = {
  tone: "done" | "running" | "failed" | "pending";
  percent: number;
};

export function barSegments({ counts, items }: LaunchProgress): BarSegment[] {
  const running = items.filter(
    ({ status }) => ITEM_TONE[status] === "progress",
  ).length;
  const pending = Math.max(
    0,
    counts.total - counts.done - counts.failed - running,
  );
  const percent = (amount: number) =>
    counts.total === 0 ? 0 : (amount / counts.total) * 100;
  return [
    { tone: "done" as const, percent: percent(counts.done) },
    { tone: "running" as const, percent: percent(running) },
    { tone: "failed" as const, percent: percent(counts.failed) },
    { tone: "pending" as const, percent: percent(pending) },
  ].filter(({ percent: share }) => share > 0);
}

export const plannedStart = (startAt: string | null) =>
  startAt !== null && Date.parse(startAt) > Date.now() ? startAt : undefined;

export const formatStart = (startAt: string | undefined) =>
  startAt === undefined
    ? t("launchProgress.startNow")
    : new Date(startAt).toLocaleString("es-AR");

export const statusLine = (
  { status }: LaunchProgress,
  startAt?: string | null,
) =>
  status === "scheduled" && startAt
    ? `${statusLabel(status)} · ${t("launchProgress.scheduledFor")} ${formatStart(startAt)}`
    : statusLabel(status);
