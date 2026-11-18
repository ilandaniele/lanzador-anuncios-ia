import type { LaunchPlan } from "../../../shared/schemas/launch";
import { t, type TextKey } from "../../i18n/es-AR";

const count = (amount: number, one: TextKey, many: TextKey) =>
  `${amount} ${t(amount === 1 ? one : many)}`;

export const planCountsText = ({ campaign, ads }: LaunchPlan) =>
  [
    campaign &&
      count(1, "launcher.review.campaignOne", "launcher.review.campaignMany"),
    count(1, "launcher.review.adsetOne", "launcher.review.adsetMany"),
    count(ads.length, "launcher.review.adOne", "launcher.review.adMany"),
  ]
    .filter(Boolean)
    .join(", ");
