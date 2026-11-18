import type { TodayAccountDto } from "../../../shared/schemas/today";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";
import { Delta } from "../metrics/Delta";
import { totalsByCurrency } from "./totals";

export function TodayTotal({ accounts }: { accounts: TodayAccountDto[] }) {
  return (
    <section aria-labelledby="hoy-total-title" className="lg:col-span-2">
      <h2 id="hoy-total-title" className="text-ink-muted">
        {t("hoy.totalTitle")}
      </h2>
      {totalsByCurrency(accounts).map(
        ({ currency, spendTodayMinor, spendYesterdayMinor }) => (
          <div key={currency} className="flex flex-wrap items-baseline gap-3">
            <p className="text-3xl font-bold tabular-nums">
              {formatMoney(spendTodayMinor, currency)}
            </p>
            <div className="flex items-baseline gap-1">
              <Delta
                sense="neutral"
                current={spendTodayMinor}
                previous={spendYesterdayMinor}
              />
              <span className="text-sm text-ink-muted">
                {t("hoy.vsYesterday")}
              </span>
            </div>
          </div>
        ),
      )}
    </section>
  );
}
