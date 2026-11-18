import type { LaunchPlan } from "../../../shared/schemas/launch";
import { t } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";
import { blockersFromFields, type Blocker } from "./blocker-steps";

export type ReviewOutcome =
  | { kind: "plan"; plan: LaunchPlan }
  | { kind: "blockers"; blockers: Blocker[] }
  | { kind: "message"; text: string; reconnect?: boolean };

export function outcomeFromError(error: unknown): ReviewOutcome | null {
  if (!(error instanceof ApiError)) return null;
  switch (error.code) {
    case "BLOCKERS":
      return {
        kind: "blockers",
        blockers: blockersFromFields(error.fields ?? {}),
      };
    case "PLAN_CHANGED":
      return { kind: "message", text: t("launcher.review.planChanged") };
    case "NOT_SIMULATED":
      return { kind: "message", text: t("launcher.review.needsSimulation") };
    case "META_RECONNECT_REQUIRED":
      return {
        kind: "message",
        text: t("launcher.review.reconnect"),
        reconnect: true,
      };
    default:
      return null;
  }
}
