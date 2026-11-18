import type { CampaignReferenceDto } from "../../../shared/schemas/meta-campaigns";
import { t, type TextKey } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";
import { formatMoney } from "../../lib/money";

const REFERENCE_ERRORS: Partial<Record<string, TextKey>> = {
  NOT_CBO: "launcher.step2.notCbo",
  NO_REFERENCE_ADSET: "launcher.step2.noReferenceAdset",
};

export const referenceErrorText = (error: Error) =>
  t(
    (error instanceof ApiError && REFERENCE_ERRORS[error.code]) ||
      "launcher.step2.referenceFailed",
  );

const bidText = ({ bidStrategy, bidAmountMinor }: CampaignReferenceDto) =>
  bidStrategy === "COST_CAP" && bidAmountMinor !== null
    ? `${t("launcher.step2.copyBidCostCap")} ${formatMoney(bidAmountMinor)}`
    : t("launcher.step2.copyBidLowest");

export function CampaignReference({
  reference,
}: {
  reference: CampaignReferenceDto;
}) {
  const rows = [
    ["launcher.step2.copyAudience", reference.countries.join(", ")],
    [
      "launcher.step2.copyEvent",
      reference.customEventType ?? reference.optimizationGoal ?? "",
    ],
    ["launcher.step2.copyBid", bidText(reference)],
  ] as const satisfies readonly (readonly [TextKey, string])[];

  return (
    <section className="rounded-sm border border-rule bg-surface p-3">
      <h2 className="mb-2 font-medium">
        {t("launcher.step2.copyFrom")} {reference.adsetName}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-muted">{t(label)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
