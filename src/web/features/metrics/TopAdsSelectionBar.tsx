import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";

type TopAdsSelectionBarProps = {
  count: number;
  creating: boolean;
  failed: boolean;
  onUse: () => void;
};

export function TopAdsSelectionBar({
  count,
  creating,
  failed,
  onUse,
}: TopAdsSelectionBarProps) {
  const unit = t(
    count === 1 ? "metrics.topAds.chosenOne" : "metrics.topAds.chosenMany",
  );
  return (
    <section
      aria-label={t("metrics.topAds.selectionLabel")}
      className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-rule bg-paper py-3"
    >
      <p className="font-medium">{`${count} ${unit}`}</p>
      {failed && (
        <p role="alert" className="text-loss">
          {t("metrics.topAds.createFailed")}
        </p>
      )}
      <Button
        loading={creating}
        loadingLabel={t("common.working")}
        onClick={onUse}
      >
        {t("metrics.topAds.use")}
      </Button>
    </section>
  );
}
