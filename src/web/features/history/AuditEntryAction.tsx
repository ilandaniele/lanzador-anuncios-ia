import { useId, useState } from "react";
import type { AuditEntryDto } from "../../../shared/schemas/audit";
import { cx, focusRing } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { AuditDetail } from "./AuditDetail";
import { actionLabel } from "./audit-model";

type AuditEntryActionProps = { workspaceId: string; entry: AuditEntryDto };

export function AuditEntryAction({
  workspaceId,
  entry,
}: AuditEntryActionProps) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();

  return (
    <div>
      <p>
        {actionLabel(entry.action)}
        {entry.objectName && (
          <span className="text-ink-muted"> · {entry.objectName}</span>
        )}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded(!expanded)}
        className={cx("text-sm text-primary underline", focusRing)}
      >
        {t(expanded ? "history.audit.hideDetail" : "history.audit.showDetail")}
      </button>
      {expanded && (
        <AuditDetail id={detailId} workspaceId={workspaceId} entry={entry} />
      )}
    </div>
  );
}
