import { t } from "../../i18n/es-AR";
import { FIELD_LABELS } from "./product-errors";
import type { ProductFormValues } from "./product-form-values";

const labelOf = (field: string) =>
  field in FIELD_LABELS
    ? t(FIELD_LABELS[field as keyof ProductFormValues])
    : field;

export function ErrorSummary({ errors }: { errors: Record<string, string> }) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;

  return (
    <div role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
      <p className="font-semibold">{t("products.errors.summary")}</p>
      <ul className="list-disc pl-5">
        {entries.map(([field, message]) => (
          <li key={field}>{`${labelOf(field)}: ${message}`}</li>
        ))}
      </ul>
    </div>
  );
}
