import { breakEvenRoas, profitPerSaleMinor } from "../../../shared/break-even";
import { t } from "../../i18n/es-AR";
import { formatRoas } from "../../lib/format-roas";
import { formatMoney } from "../../lib/money";

type EconomyPanelProps = {
  priceMinor: number | null;
  costMinor: number | null;
  currency: string;
};

const costIsNotBelowPrice = (price: number | null, cost: number | null) =>
  price !== null && cost !== null && cost >= price;

export function EconomyPanel({
  priceMinor,
  costMinor,
  currency,
}: EconomyPanelProps) {
  const roas = breakEvenRoas(priceMinor, costMinor);
  const profit = profitPerSaleMinor(priceMinor, costMinor);

  return (
    <section
      aria-labelledby="economia-titulo"
      className="rounded-md border border-rule bg-surface p-4"
    >
      <h2 id="economia-titulo" className="mb-3 font-semibold">
        {t("products.economy.title")}
      </h2>
      {roas === null || profit === null ? (
        <p className="text-ink-muted">
          {costIsNotBelowPrice(priceMinor, costMinor)
            ? t("products.economy.costNotBelowPrice")
            : t("products.economy.incomplete")}
        </p>
      ) : (
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-ink-muted">{t("products.economy.roas")}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {formatRoas(roas)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("products.economy.profit")}</dt>
            <dd className="font-semibold tabular-nums">
              {formatMoney(profit, currency)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
