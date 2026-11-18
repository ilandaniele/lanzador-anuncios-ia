import type { LaunchStatus } from "../../../shared/schemas/launch";
import type { StatusTone } from "../../components/Chip";

const STATUS_TONE: Record<LaunchStatus, StatusTone> = {
  draft: "draft",
  simulated: "draft",
  queued: "progress",
  running: "progress",
  verifying: "progress",
  paused_verified: "paused",
  verified_with_errors: "warn",
  activating: "progress",
  active: "ready",
  scheduled: "progress",
  failed: "error",
  discarded: "paused",
};

export const launchStatusTone = (status: LaunchStatus) => STATUS_TONE[status];

export const canActivateFromHistory = (status: LaunchStatus) =>
  status === "paused_verified";
