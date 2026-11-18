import type { LaunchStatus } from "../../../shared/schemas/launch";
import type { StatusTone } from "../../components/Chip";

const LAUNCH_TONE: Record<LaunchStatus, StatusTone> = {
  draft: "draft",
  simulated: "draft",
  queued: "progress",
  running: "progress",
  verifying: "progress",
  activating: "progress",
  paused_verified: "paused",
  verified_with_errors: "warn",
  active: "ready",
  scheduled: "ready",
  failed: "error",
  discarded: "paused",
};

export const launchTone = (status: LaunchStatus) => LAUNCH_TONE[status];

export const canActivate = (status: LaunchStatus) =>
  status === "paused_verified";
