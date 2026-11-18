import type { ReactNode } from "react";
import type { CopyDto } from "../../../shared/schemas/copies";
import { t } from "../../i18n/es-AR";

function WarnStrip({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-sm bg-warn-soft px-3 py-2 text-warn">
      <span aria-hidden="true">!</span>
      <span>{children}</span>
    </p>
  );
}

type PolicyNotesProps = Pick<
  CopyDto,
  "policyRisk" | "policyNote" | "overLimit"
>;

export function PolicyNotes({
  policyRisk,
  policyNote,
  overLimit,
}: PolicyNotesProps) {
  const riskLabel = t(
    policyRisk === "high" ? "copys.riskHigh" : "copys.riskLow",
  );
  return (
    <>
      {policyRisk !== "none" && (
        <WarnStrip>
          {policyNote ? `${riskLabel}: ${policyNote}` : riskLabel}
        </WarnStrip>
      )}
      {overLimit && <WarnStrip>{t("copys.overLimit")}</WarnStrip>}
    </>
  );
}
