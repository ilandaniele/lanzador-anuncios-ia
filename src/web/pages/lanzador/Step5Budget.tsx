import { useEffect, useState } from "react";
import type { Settings } from "../../../shared/schemas/workspaces";
import { MoneyInput } from "../../components/MoneyInput";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Input } from "../../components/TextField";
import {
  budgetBlock,
  budgetDefaults,
  isOverBudgetCap,
  isStartInPast,
} from "../../features/launch/budget-completion";
import { CountryChips } from "../../features/launch/CountryChips";
import {
  fromLocalInputValue,
  toLocalInputValue,
} from "../../features/launch/schedule";
import { SettingsGate } from "../../features/launch/SettingsGate";
import type { StepProps } from "../../features/launch/step-types";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";

type BudgetFormProps = StepProps & { settings: Settings };

function BudgetForm({
  draft,
  update,
  setBlockReason,
  settings,
}: BudgetFormProps) {
  const [now] = useState(Date.now);
  const [scheduling, setScheduling] = useState(Boolean(draft.startAt));
  const defaults = budgetDefaults(draft, settings);
  const needsDefaults = Object.keys(defaults).length > 0;
  const values = { ...draft, ...defaults };
  const isNewCbo = draft.mode === "new_cbo";
  const { budgetCurrency, maxCampaignBudgetMinor } = settings;
  const blockText = budgetBlock(draft, settings, now);

  useEffect(() => {
    if (needsDefaults) update(defaults);
  }, [needsDefaults, defaults, update]);

  useEffect(() => {
    setBlockReason(blockText);
    return () => setBlockReason(null);
  }, [blockText, setBlockReason]);

  function toggleSchedule(enabled: boolean) {
    setScheduling(enabled);
    if (!enabled) update({ startAt: undefined });
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      {isNewCbo ? (
        <MoneyInput
          label={t("launcher.step5.budgetLabel")}
          required
          currency={budgetCurrency}
          value={draft.dailyBudgetMinor ?? null}
          hint={`${t("launcher.step5.capHint")} ${formatMoney(maxCampaignBudgetMinor, budgetCurrency)}`}
          error={
            isOverBudgetCap(draft, settings)
              ? t("launcher.step5.overCap")
              : undefined
          }
          onChange={(minor) => update({ dailyBudgetMinor: minor || undefined })}
        />
      ) : (
        <p className="text-ink-muted">{t("launcher.step5.existingBudget")}</p>
      )}
      <SegmentedControl
        legend={t("launcher.step5.strategyLegend")}
        value={values.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP"}
        options={[
          {
            value: "LOWEST_COST_WITHOUT_CAP",
            label: t("launcher.step5.lowestCost"),
          },
          { value: "COST_CAP", label: t("launcher.step5.costCap") },
        ]}
        onChange={(bidStrategy) =>
          update({
            bidStrategy,
            ...(bidStrategy === "COST_CAP"
              ? {}
              : { bidAmountMinor: undefined }),
          })
        }
      />
      {values.bidStrategy === "COST_CAP" && (
        <MoneyInput
          label={t("launcher.step5.bidAmountLabel")}
          required
          currency={budgetCurrency}
          value={draft.bidAmountMinor ?? null}
          onChange={(minor) => update({ bidAmountMinor: minor || undefined })}
        />
      )}
      <CountryChips
        countries={values.countries ?? []}
        onChange={(countries) => update({ countries })}
      />
      <p>
        <span className="font-medium">{t("launcher.step5.eventLabel")}: </span>
        {t("launcher.step5.eventPurchase")}
      </p>
      <fieldset className="flex flex-col gap-2">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={scheduling}
            onChange={(event) => toggleSchedule(event.target.checked)}
          />
          {t("launcher.step5.scheduleLabel")}
        </label>
        <p className="text-ink-muted">{t("launcher.step5.scheduleHint")}</p>
        {scheduling && (
          <Input
            type="datetime-local"
            label={t("launcher.step5.scheduleDateLabel")}
            value={draft.startAt ? toLocalInputValue(draft.startAt) : ""}
            error={
              isStartInPast(draft, now)
                ? t("launcher.step5.schedulePast")
                : undefined
            }
            onChange={(event) =>
              update({ startAt: fromLocalInputValue(event.target.value) })
            }
          />
        )}
      </fieldset>
    </div>
  );
}

export function Step5Budget(props: StepProps) {
  return (
    <SettingsGate
      workspaceId={props.workspaceId}
      failedText={t("launcher.step5.settingsFailed")}
    >
      {(settings) => <BudgetForm {...props} settings={settings} />}
    </SettingsGate>
  );
}
