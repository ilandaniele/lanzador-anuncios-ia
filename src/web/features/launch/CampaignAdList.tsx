import type { CampaignAdDto } from "../../../shared/schemas/meta-campaigns";
import { t } from "../../i18n/es-AR";
import { formatRoas } from "../../lib/format-roas";
import { formatMoney } from "../../lib/money";
import { Thumbnail } from "./Thumbnail";

type CampaignAdListProps = {
  ads: CampaignAdDto[];
  isChosen: (ad: CampaignAdDto) => boolean;
  onToggle: (ad: CampaignAdDto) => void;
};

export function CampaignAdList({
  ads,
  isChosen,
  onToggle,
}: CampaignAdListProps) {
  return (
    <>
      {ads.map((ad) => (
        <label
          key={ad.adId}
          className="flex cursor-pointer items-center gap-3 rounded-sm border border-rule-strong bg-surface p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
        >
          <input
            type="checkbox"
            checked={isChosen(ad)}
            onChange={() => onToggle(ad)}
          />
          <Thumbnail url={ad.thumbnailUrl} />
          <span className="min-w-0 flex-1 font-medium">{ad.name}</span>
          <span className="tabular-nums text-ink-muted">
            {t("launcher.step4.spend")} {formatMoney(ad.spendMinor)}
          </span>
          <span className="tabular-nums text-ink-muted">
            {t("launcher.step4.roas")}{" "}
            {ad.roas === null
              ? t("launcher.step4.noRoas")
              : formatRoas(ad.roas)}
          </span>
        </label>
      ))}
    </>
  );
}
