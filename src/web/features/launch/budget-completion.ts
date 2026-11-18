import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import type { Settings } from "../../../shared/schemas/workspaces";
import { t } from "../../i18n/es-AR";

const DEFAULT_BID_STRATEGY = "LOWEST_COST_WITHOUT_CAP";

export const isBudgetStepComplete = ({
  mode,
  dailyBudgetMinor,
  bidStrategy,
  bidAmountMinor,
  countries,
  optimizationEvent,
}: PartialLaunchDraft) =>
  Boolean(bidStrategy && optimizationEvent && countries?.length) &&
  (mode === "existing_cbo" || Boolean(dailyBudgetMinor)) &&
  (bidStrategy !== "COST_CAP" || Boolean(bidAmountMinor));

export const budgetDefaults = (
  draft: PartialLaunchDraft,
  { defaultCountries }: Pick<Settings, "defaultCountries">,
): PartialLaunchDraft => ({
  ...(draft.bidStrategy ? {} : { bidStrategy: DEFAULT_BID_STRATEGY }),
  ...(draft.countries?.length ? {} : { countries: defaultCountries }),
  ...(draft.optimizationEvent ? {} : { optimizationEvent: "PURCHASE" }),
});

export const isOverBudgetCap = (
  { mode, dailyBudgetMinor }: PartialLaunchDraft,
  { maxCampaignBudgetMinor }: Pick<Settings, "maxCampaignBudgetMinor">,
) =>
  mode === "new_cbo" &&
  dailyBudgetMinor !== undefined &&
  dailyBudgetMinor > maxCampaignBudgetMinor;

export const isStartInPast = ({ startAt }: PartialLaunchDraft, now: number) =>
  startAt !== undefined && Date.parse(startAt) <= now;

export function budgetBlock(
  draft: PartialLaunchDraft,
  settings: Pick<Settings, "maxCampaignBudgetMinor">,
  now: number,
): string | null {
  if (isOverBudgetCap(draft, settings)) return t("launcher.step5.overCap");
  if (isStartInPast(draft, now)) return t("launcher.step5.schedulePast");
  return null;
}
