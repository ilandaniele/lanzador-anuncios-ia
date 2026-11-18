import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";

type CreativeSelectionBarProps = {
  count: number;
  creating: boolean;
  failed: boolean;
  onUse: () => void;
};

export function CreativeSelectionBar({
  count,
  creating,
  failed,
  onUse,
}: CreativeSelectionBarProps) {
  const unit = t(count === 1 ? "creatives.chosenOne" : "creatives.chosenMany");
  return (
    <section
      aria-label={t("creatives.selectionLabel")}
      className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-rule bg-paper py-3"
    >
      <p className="font-medium">{`${count} ${unit}`}</p>
      {failed && (
        <p role="alert" className="text-loss">
          {t("creatives.createFailed")}
        </p>
      )}
      <Button
        loading={creating}
        loadingLabel={t("common.working")}
        onClick={onUse}
      >
        {t("creatives.use")}
      </Button>
    </section>
  );
}
