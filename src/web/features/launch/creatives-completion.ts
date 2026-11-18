import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import { t } from "../../i18n/es-AR";
import type { CreativeState } from "./creative-state";

export const isCreativesStepComplete = ({ items }: PartialLaunchDraft) =>
  Boolean(items?.length);

export type CreativesBlock = { text: string; role: "alert" | "status" };

export function creativesBlock(
  count: number,
  max: number,
  states: CreativeState[],
): CreativesBlock | null {
  if (count > max) return { text: t("launcher.step4.tooMany"), role: "alert" };
  if (states.includes("unavailable"))
    return { text: t("launcher.step4.removeUnavailable"), role: "alert" };
  if (states.includes("processing"))
    return { text: t("launcher.step4.waitProcessing"), role: "status" };
  return null;
}
