import type { TodayAccountDto } from "../../../shared/schemas/today";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";
import { Delta } from "../metrics/Delta";
import { RoasValue } from "../metrics/RoasValue";

function AccountCard({ account }: { account: TodayAccountDto }) {
  return (
    <li className="rounded-md border border-rule bg-surface p-4 md:px-6">
      <h3 className="font-semibold">{account.name}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <dt className="text-sm text-ink-muted">{t("hoy.spendToday")}</dt>
          <dd className="tabular-nums">
            {formatMoney(account.spendTodayMinor, account.currency)}
            <Delta
              sense="neutral"
              current={account.spendTodayMinor}
              previous={account.spendYesterdayMinor}
            />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">{t("hoy.roasToday")}</dt>
          <dd className="tabular-nums">
            <RoasValue roas={account.roas} breakEvenRoas={null} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

type AccountCardsProps = { accounts: TodayAccountDto[]; className?: string };

export function AccountCards({ accounts, className }: AccountCardsProps) {
  return (
    <section aria-labelledby="hoy-accounts-title" className={className}>
      <h2 id="hoy-accounts-title" className="mb-2 font-semibold">
        {t("hoy.accountsTitle")}
      </h2>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </ul>
    </section>
  );
}
