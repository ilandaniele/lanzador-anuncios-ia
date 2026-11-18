import type { CampaignReference } from "../../integrations/meta/read";
import type { AdsetReference } from "./payloads";

export function toAdsetReference({
  bidStrategy,
  adsets,
}: CampaignReference): AdsetReference | undefined {
  const [newest] = adsets;
  if (
    !newest ||
    !bidStrategy ||
    !newest.optimizationGoal ||
    !newest.billingEvent ||
    !newest.customEventType ||
    !newest.targeting
  ) {
    return undefined;
  }
  return {
    campaignBidStrategy: bidStrategy,
    optimizationGoal: newest.optimizationGoal,
    billingEvent: newest.billingEvent,
    attributionSpec: newest.attributionSpec,
    targeting: newest.targeting,
    customEventType: newest.customEventType,
    bidAmount: newest.bidAmountMinor ?? undefined,
    bidConstraints: newest.bidConstraints,
  };
}
