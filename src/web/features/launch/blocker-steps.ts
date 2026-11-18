import type { LaunchPlan } from "../../../shared/schemas/launch";
import { t, type TextKey } from "../../i18n/es-AR";

export type Blocker = { key: string; text: string; step?: number };

const ACCOUNT_STEP = 0;
const STRUCTURE_STEP = 1;
const PRODUCT_STEP = 2;
const CREATIVES_STEP = 3;
const BUDGET_STEP = 4;

const DRAFT_FIELDS: Record<string, { step: number; label: TextKey }> = {
  adAccountAssetId: {
    step: ACCOUNT_STEP,
    label: "launcher.account.accountLabel",
  },
  pageId: { step: ACCOUNT_STEP, label: "launcher.account.pageLabel" },
  instagramUserId: {
    step: ACCOUNT_STEP,
    label: "launcher.account.instagramLabel",
  },
  pixelId: { step: ACCOUNT_STEP, label: "launcher.account.pixelLabel" },
  mode: { step: STRUCTURE_STEP, label: "launcher.step2.modeLabel" },
  existingCampaignId: {
    step: STRUCTURE_STEP,
    label: "launcher.step2.campaignLabel",
  },
  campaignName: {
    step: STRUCTURE_STEP,
    label: "launcher.step2.campaignNameLabel",
  },
  adsetName: { step: STRUCTURE_STEP, label: "launcher.step2.adsetNameLabel" },
  productId: { step: PRODUCT_STEP, label: "launcher.step3.productLabel" },
  copy: { step: PRODUCT_STEP, label: "launcher.summary.product" },
  items: { step: CREATIVES_STEP, label: "launcher.step4.listTitle" },
  dailyBudgetMinor: {
    step: BUDGET_STEP,
    label: "launcher.step5.budgetLabel",
  },
  bidStrategy: { step: BUDGET_STEP, label: "launcher.step5.strategyLegend" },
  bidAmountMinor: {
    step: BUDGET_STEP,
    label: "launcher.step5.bidAmountLabel",
  },
  countries: { step: BUDGET_STEP, label: "launcher.step5.countriesLegend" },
  optimizationEvent: {
    step: BUDGET_STEP,
    label: "launcher.step5.eventLabel",
  },
};

const CODE_STEPS: Record<string, number> = {
  ACCOUNT_NOT_ELIGIBLE: ACCOUNT_STEP,
  ACCOUNT_NOT_USD: ACCOUNT_STEP,
  CAMPAIGN_REQUIRED: STRUCTURE_STEP,
  NOT_CBO: STRUCTURE_STEP,
  NO_REFERENCE_ADSET: STRUCTURE_STEP,
  LANDING_ERROR: PRODUCT_STEP,
  CLONE_OTHER_PAGE: CREATIVES_STEP,
  CLONE_SOURCE_REQUIRED: CREATIVES_STEP,
  CREATIVE_NOT_FOUND: CREATIVES_STEP,
  CREATIVE_NOT_READY: CREATIVES_STEP,
  CREATIVE_REQUIRED: CREATIVES_STEP,
  MEDIA_KIND_REQUIRED: CREATIVES_STEP,
  MEDIA_NOT_IN_ACCOUNT: CREATIVES_STEP,
  MIXED_MEDIA: CREATIVES_STEP,
  TOO_MANY_ITEMS: CREATIVES_STEP,
  TOO_MANY_PER_ADSET: CREATIVES_STEP,
  BUDGET_REQUIRED: BUDGET_STEP,
  BUDGET_CAP: BUDGET_STEP,
  BID_AMOUNT_REQUIRED: BUDGET_STEP,
};

export const blockersFromPlan = (lines: LaunchPlan["blockers"]): Blocker[] =>
  lines.map(({ code, text }) => ({ key: code, text, step: CODE_STEPS[code] }));

export function blockersFromFields(fields: Record<string, string>): Blocker[] {
  return Object.entries(fields).map(([key, value]) => {
    const field = DRAFT_FIELDS[key.split(".")[0]!];
    return field
      ? {
          key,
          step: field.step,
          text: `${t(field.label)}: ${t("launcher.review.fieldInvalid")}`,
        }
      : { key, text: value, step: CODE_STEPS[key] };
  });
}
