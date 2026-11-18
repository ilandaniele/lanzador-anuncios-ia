import type { ReceiptRow } from "../../components/ConfirmDialog";
import { t } from "../../i18n/es-AR";

export function ReviewReceipt({ rows }: { rows: ReceiptRow[] }) {
  return (
    <section aria-labelledby="review-receipt-title">
      <h3 id="review-receipt-title" className="mb-2 font-semibold">
        {t("launcher.review.receiptTitle")}
      </h3>
      <dl className="max-w-[640px] border-y border-rule bg-surface">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className="flex justify-between gap-4 border-b border-rule px-3 py-2 last:border-b-0"
          >
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
