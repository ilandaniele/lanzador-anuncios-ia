import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";

type LoadMoreButtonProps = { loading: boolean; onClick: () => void };

export const LoadMoreButton = ({ loading, onClick }: LoadMoreButtonProps) => (
  <div className="mt-4 flex justify-center">
    <Button
      variant="secondary"
      loading={loading}
      loadingLabel={t("common.working")}
      onClick={onClick}
    >
      {t("admin.loadMore")}
    </Button>
  </div>
);
