import type {
  Settings,
  SettingsPatch,
  WorkspaceOverview,
} from "../../../shared/schemas/workspaces";
import { t } from "../../i18n/es-AR";
import type { GeneralChanges } from "./use-workspace-settings";

const SETTING_KEYS = [
  "timezone",
  "budgetCurrency",
  "maxCampaignBudgetMinor",
  "advantageCreativeEnabled",
  "nameTemplates",
] as const;

export type GeneralDraft = { name: string } & Omit<
  Pick<Settings, (typeof SETTING_KEYS)[number]>,
  "maxCampaignBudgetMinor"
> & { maxCampaignBudgetMinor: number | null };

export type GeneralErrors = Partial<
  Record<
    "name" | "maxCampaignBudgetMinor" | keyof Settings["nameTemplates"],
    string
  >
>;

export const toDraft = ({
  workspace,
  settings,
}: WorkspaceOverview): GeneralDraft => ({
  name: workspace.name,
  timezone: settings.timezone,
  budgetCurrency: settings.budgetCurrency,
  maxCampaignBudgetMinor: settings.maxCampaignBudgetMinor,
  advantageCreativeEnabled: settings.advantageCreativeEnabled,
  nameTemplates: settings.nameTemplates,
});

const differs = (a: unknown, b: unknown) =>
  JSON.stringify(a) !== JSON.stringify(b);

export function toChanges(
  initial: GeneralDraft,
  draft: GeneralDraft,
): GeneralChanges | null {
  const settings = Object.fromEntries(
    SETTING_KEYS.filter((key) => differs(initial[key], draft[key])).map(
      (key) => [key, draft[key]],
    ),
  ) as SettingsPatch;
  const changes: GeneralChanges = {};
  if (draft.name !== initial.name) changes.name = draft.name;
  if (Object.keys(settings).length > 0) changes.settings = settings;
  return Object.keys(changes).length > 0 ? changes : null;
}

export function validate(draft: GeneralDraft): GeneralErrors {
  const errors: GeneralErrors = {};
  if (draft.name.trim() === "")
    errors.name = t("workspaceSettings.nameRequired");
  if (!draft.maxCampaignBudgetMinor)
    errors.maxCampaignBudgetMinor = t("workspaceSettings.maxBudgetInvalid");
  for (const kind of ["campaign", "adset", "ad"] as const)
    if (draft.nameTemplates[kind].trim() === "")
      errors[kind] = t("workspaceSettings.templateRequired");
  return errors;
}
