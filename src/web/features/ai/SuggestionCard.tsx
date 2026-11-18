import { useId, useState } from "react";
import type { CopyDto, CopyPatch } from "../../../shared/schemas/copies";
import { Button, IconButton } from "../../components/Button";
import { cx } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { CopyContent } from "./CopyContent";
import { CopyEditor } from "./CopyEditor";
import { PolicyNotes } from "./PolicyNotes";
import { usePatchCopy } from "./use-copies";

type SuggestionCardProps = {
  workspaceId: string;
  copy: CopyDto;
  canEdit: boolean;
  onChanged?: (copy: CopyDto) => void;
};

export function SuggestionCard({
  workspaceId,
  copy,
  canEdit,
  onChanged,
}: SuggestionCardProps) {
  const headlineId = useId();
  const [editing, setEditing] = useState(false);
  const patch = usePatchCopy(workspaceId, copy.productId);
  const saved = copy.status === "saved";

  function apply(changes: CopyPatch) {
    patch.mutate(
      { copyId: copy.id, changes },
      {
        onSuccess: (updated) => {
          setEditing(false);
          onChanged?.(updated);
        },
      },
    );
  }

  return (
    <article
      aria-labelledby={headlineId}
      className={cx(
        "flex flex-col gap-3 rounded-md border-[1.5px] bg-surface p-4",
        saved ? "border-primary" : "border-dashed border-pencil",
      )}
    >
      <header
        className={cx(
          "flex items-center gap-2 text-2xs",
          saved ? "text-primary" : "text-pencil",
        )}
      >
        <span aria-hidden="true">{saved ? "✓" : "✎"}</span>
        <span>{t(saved ? "copys.saved" : "copys.proposal")}</span>
        {copy.angle !== "manual" && (
          <span>{`${t("copys.angle")}: ${t(`copys.angles.${copy.angle}`)}`}</span>
        )}
      </header>
      {editing ? (
        <CopyEditor
          copy={copy}
          pending={patch.isPending}
          onSubmit={(text) => apply({ ...text, status: "saved" })}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CopyContent copy={copy} headlineId={headlineId} />
      )}
      <PolicyNotes
        policyRisk={copy.policyRisk}
        policyNote={copy.policyNote}
        overLimit={copy.overLimit}
      />
      {patch.isError && (
        <p role="alert" className="text-loss">
          {t("copys.actionFailed")}
        </p>
      )}
      {canEdit && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          {!saved && (
            <Button
              variant="secondary"
              loading={patch.isPending}
              onClick={() => apply({ status: "saved" })}
            >
              {t("copys.save")}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setEditing(true)}>
            {t("copys.edit")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => apply({ status: "discarded" })}
          >
            {t("copys.discard")}
          </Button>
          <IconButton
            aria-label={t(
              copy.favorite ? "copys.unfavorite" : "copys.favorite",
            )}
            aria-pressed={copy.favorite}
            onClick={() => apply({ favorite: !copy.favorite })}
          >
            <span aria-hidden="true">{copy.favorite ? "★" : "☆"}</span>
          </IconButton>
        </div>
      )}
      <span role="status" className="sr-only">
        {saved ? t("copys.savedAnnounce") : ""}
      </span>
    </article>
  );
}
