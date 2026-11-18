import { Link } from "react-router";
import type { AuditEntryDto } from "../../../shared/schemas/audit";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { detailChanges, proposalIdOf } from "./audit-model";

type AuditDetailProps = {
  id: string;
  workspaceId: string;
  entry: AuditEntryDto;
};

export function AuditDetail({ id, workspaceId, entry }: AuditDetailProps) {
  const changes = detailChanges(entry);
  const proposalId = proposalIdOf(entry);

  return (
    <div id={id} className="mt-2 flex flex-col gap-2 text-sm">
      {changes.length === 0 ? (
        <p className="text-ink-muted">{t("history.audit.noChanges")}</p>
      ) : (
        <dl className="flex flex-col gap-1">
          {changes.map(({ field, before, after }) => (
            <div key={field}>
              <dt className="font-medium">{field}</dt>
              <dd className="tabular-nums">
                <span className="text-ink-muted">
                  {t("history.audit.before")}
                </span>{" "}
                {before} →{" "}
                <span className="text-ink-muted">
                  {t("history.audit.after")}
                </span>{" "}
                {after}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {proposalId && (
        <Link
          to={workspacePath(workspaceId, `piloto?propuesta=${proposalId}`)}
          className="text-primary underline"
        >
          {t("history.audit.proposalLink")}
        </Link>
      )}
    </div>
  );
}
