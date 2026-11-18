import type { LaunchStatus } from "./schemas/launch";

const IN_FLIGHT_LAUNCH_STATUSES: readonly LaunchStatus[] = [
  "queued",
  "running",
  "verifying",
  "activating",
];

export const RETRYABLE_LAUNCH_STATUSES: readonly LaunchStatus[] = [
  "failed",
  "paused_verified",
  "verified_with_errors",
];

export const isLaunchInFlight = (status: LaunchStatus) =>
  IN_FLIGHT_LAUNCH_STATUSES.includes(status);
