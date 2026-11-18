import type { CreativeDto } from "../../../shared/schemas/creatives";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { budgetExhaustedReason } from "../../features/ai/budget-reason";
import { TagsEditor } from "../../features/creatives/TagsEditor";
import {
  useRetagCreative,
  useSaveCreativeTags,
} from "../../features/creatives/use-creatives";
import { UsedIn } from "../../features/creatives/UsedIn";
import { Thumbnail } from "../../features/launch/Thumbnail";
import { t } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

type CreativeDetailProps = {
  workspaceId: string;
  creative: CreativeDto;
  canEdit: boolean;
  onClose: () => void;
};

function retagFailure(error: unknown) {
  if (error instanceof ApiError && error.code === "CREATIVE_NOT_READY")
    return t("creatives.detail.retagNotReady");
  return budgetExhaustedReason(error) ?? t("creatives.detail.retagFailed");
}

export function CreativeDetail({
  workspaceId,
  creative,
  canEdit,
  onClose,
}: CreativeDetailProps) {
  const saveTags = useSaveCreativeTags(workspaceId, creative.id);
  const retag = useRetagCreative(workspaceId, creative.id);

  return (
    <Dialog title={creative.name} onClose={onClose} width="wide">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex w-40 shrink-0 flex-col gap-2">
          <Thumbnail
            url={creative.thumbnailUrl}
            className="aspect-[4/5] w-full"
          />
          <UsedIn count={creative.usedInLaunches} />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <h3 className="font-medium">{t("creatives.detail.tagsTitle")}</h3>
          <TagsEditor
            tags={creative.tags}
            disabled={!canEdit}
            onSave={(tags) => saveTags.mutate(tags)}
          />
          {saveTags.isError && (
            <p role="alert" className="text-loss">
              {t("creatives.detail.saveFailed")}
            </p>
          )}
          {canEdit && (
            <div className="flex flex-col items-start gap-2">
              <Button
                variant="secondary"
                loading={retag.isPending}
                loadingLabel={t("common.working")}
                disabledReason={
                  creative.status === "ready"
                    ? undefined
                    : t("creatives.detail.retagNotReady")
                }
                onClick={() => retag.mutate()}
              >
                {t("creatives.detail.retag")}
              </Button>
              {retag.isSuccess && (
                <p role="status" className="text-ink-muted">
                  {t("creatives.detail.retagSent")}
                </p>
              )}
              {retag.isError && (
                <p role="alert" className="text-loss">
                  {retagFailure(retag.error)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    </Dialog>
  );
}
