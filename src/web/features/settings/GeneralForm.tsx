import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/MoneyInput";
import { Select } from "../../components/Select";
import { Input } from "../../components/TextField";
import { useToast } from "../../components/Toast";
import { t, type TextKey } from "../../i18n/es-AR";
import { currencyOptions, timezoneOptions } from "./general-options";
import { toChanges, validate, type GeneralDraft } from "./general-draft";
import { useSaveGeneral } from "./use-workspace-settings";

const TEMPLATE_LABELS = {
  campaign: "workspaceSettings.templateCampaign",
  adset: "workspaceSettings.templateAdset",
  ad: "workspaceSettings.templateAd",
} as const satisfies Record<keyof GeneralDraft["nameTemplates"], TextKey>;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-lg font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

type AdvantageSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function AdvantageSwitch({ checked, onChange }: AdvantageSwitchProps) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="mt-1 size-5"
        aria-describedby={hintId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div>
        <label htmlFor={id} className="font-medium">
          {t("workspaceSettings.advantage")}
        </label>
        <p id={hintId} className="text-ink-muted">
          {t("workspaceSettings.advantageHint")}
        </p>
      </div>
    </div>
  );
}

type GeneralFormProps = { workspaceId: string; initial: GeneralDraft };

export function GeneralForm({ workspaceId, initial }: GeneralFormProps) {
  const [draft, setDraft] = useState(initial);
  const save = useSaveGeneral(workspaceId);
  const { notify } = useToast();
  const changes = toChanges(initial, draft);
  const errors = validate(draft);
  const hasErrors = Object.keys(errors).length > 0;
  const update = (patch: Partial<GeneralDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!changes || hasErrors) return;
    save.mutate(changes, {
      onSuccess: () =>
        notify({ tone: "success", message: t("workspaceSettings.saved") }),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <Group title={t("workspaceSettings.groupWorkspace")}>
        <Input
          label={t("workspaceSettings.name")}
          value={draft.name}
          error={errors.name}
          onChange={(event) => update({ name: event.target.value })}
        />
        <Select
          label={t("workspaceSettings.timezone")}
          options={timezoneOptions(initial.timezone)}
          value={draft.timezone}
          onChange={(event) => update({ timezone: event.target.value })}
        />
        <Select
          label={t("workspaceSettings.currency")}
          options={currencyOptions(initial.budgetCurrency)}
          value={draft.budgetCurrency}
          onChange={(event) => update({ budgetCurrency: event.target.value })}
        />
      </Group>
      <Group title={t("workspaceSettings.groupLimits")}>
        <MoneyInput
          label={t("workspaceSettings.maxBudget")}
          currency={draft.budgetCurrency}
          value={draft.maxCampaignBudgetMinor}
          error={errors.maxCampaignBudgetMinor}
          onChange={(minor) => update({ maxCampaignBudgetMinor: minor })}
        />
      </Group>
      <Group title={t("workspaceSettings.groupAds")}>
        <AdvantageSwitch
          checked={draft.advantageCreativeEnabled}
          onChange={(advantageCreativeEnabled) =>
            update({ advantageCreativeEnabled })
          }
        />
      </Group>
      <Group title={t("workspaceSettings.groupTemplates")}>
        {(Object.keys(TEMPLATE_LABELS) as (keyof typeof TEMPLATE_LABELS)[]).map(
          (kind) => (
            <Input
              key={kind}
              label={t(TEMPLATE_LABELS[kind])}
              value={draft.nameTemplates[kind]}
              error={errors[kind]}
              onChange={(event) =>
                update({
                  nameTemplates: {
                    ...draft.nameTemplates,
                    [kind]: event.target.value,
                  },
                })
              }
            />
          ),
        )}
      </Group>
      {save.isError && (
        <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
          {t("errors.generic")}
        </p>
      )}
      {changes && (
        <div className="sticky bottom-0 -mx-4 border-t border-rule bg-paper p-4">
          <Button
            type="submit"
            loading={save.isPending}
            loadingLabel={t("common.working")}
          >
            {t("workspaceSettings.save")}
          </Button>
        </div>
      )}
    </form>
  );
}
