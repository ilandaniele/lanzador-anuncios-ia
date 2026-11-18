import type { PilotProposalDto } from "../../../shared/schemas/pilot";
import { t } from "../../i18n/es-AR";
import { useMe } from "../auth/use-me";
import { decidedTime } from "./proposal-model";

export function ApprovedStamp({
  decidedAt,
}: Pick<PilotProposalDto, "decidedAt">) {
  const { data: me } = useMe();
  const approver = me?.user.name ?? me?.user.email;

  return (
    <p role="status" className="mt-4 font-semibold">
      <span aria-hidden="true">✓ </span>
      {t("pilot.approvedStamp")} {decidedTime(decidedAt)}
      {approver && ` ${t("pilot.approvedBy")} ${approver}`}
    </p>
  );
}
