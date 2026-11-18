import { useState } from "react";
import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import type { MetricsRowDto } from "../../../shared/schemas/metrics";
import {
  isActionable,
  isScalable,
  isWritableStatus,
  type ActionableRow,
} from "./row-actions-model";
import { ScaleDialog } from "./ScaleDialog";
import { useProtectAction, useStatusAction } from "./use-row-actions";

type RowActionsProps = {
  workspaceId: string;
  row: MetricsRowDto;
};

function ActionButtons({
  workspaceId,
  row,
}: {
  workspaceId: string;
  row: ActionableRow;
}) {
  const [scaling, setScaling] = useState(false);
  const status = useStatusAction(workspaceId, row);
  const protection = useProtectAction(workspaceId, row);
  const statusAction = t(
    row.status === "PAUSED"
      ? "metrics.actions.activate"
      : "metrics.actions.pause",
  );
  const protectAction = t(
    row.protected ? "metrics.actions.unprotect" : "metrics.actions.protect",
  );

  return (
    <div className="flex flex-wrap gap-1">
      {isWritableStatus(row.status) && (
        <Button
          variant="ghost"
          loading={status.pending}
          aria-label={`${statusAction} ${row.name}`}
          onClick={status.toggle}
        >
          {statusAction}
        </Button>
      )}
      {isScalable(row) && (
        <>
          <Button
            variant="ghost"
            aria-label={`${t("metrics.actions.scale")} ${row.name}`}
            onClick={() => setScaling(true)}
          >
            {t("metrics.actions.scale")}
          </Button>
          {scaling && (
            <ScaleDialog
              workspaceId={workspaceId}
              row={row}
              onClose={() => setScaling(false)}
            />
          )}
        </>
      )}
      {row.level === "campaign" && (
        <Button
          variant="ghost"
          loading={protection.pending}
          aria-label={`${protectAction} ${row.name}`}
          onClick={protection.toggle}
        >
          {protectAction}
        </Button>
      )}
    </div>
  );
}

export function RowActions({ workspaceId, row }: RowActionsProps) {
  return isActionable(row) ? (
    <ActionButtons workspaceId={workspaceId} row={row} />
  ) : null;
}
