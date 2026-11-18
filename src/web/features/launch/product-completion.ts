import type { PartialLaunchDraft } from "../../../shared/schemas/launch";

export const isProductStepComplete = ({
  productId,
  copy,
}: PartialLaunchDraft) =>
  Boolean(productId && copy?.primaryText && copy.headline && copy.cta);
