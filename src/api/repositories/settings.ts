import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { workspaceSettings } from "../../db/schema/workspaces";
import type { Settings, SettingsPatch } from "../../shared/schemas/workspaces";
import { auditStatement, type AuditEntry } from "./audit";
import { inWorkspace, type Scope } from "./scope";

const settingsColumns = {
  maxCampaignBudgetMinor: workspaceSettings.maxCampaignBudgetMinor,
  budgetCurrency: workspaceSettings.budgetCurrency,
  maxScalePercent: workspaceSettings.maxScalePercent,
  advantageCreativeEnabled: workspaceSettings.advantageCreativeEnabled,
  timezone: workspaceSettings.timezone,
  defaultCountries: workspaceSettings.defaultCountries,
  campaignNameTemplate: workspaceSettings.campaignNameTemplate,
  adsetNameTemplate: workspaceSettings.adsetNameTemplate,
  adNameTemplate: workspaceSettings.adNameTemplate,
  launchDefaults: workspaceSettings.launchDefaults,
};

type SettingsRow = Pick<
  typeof workspaceSettings.$inferSelect,
  keyof typeof settingsColumns
>;

export const toSettings = (row: SettingsRow): Settings => ({
  maxCampaignBudgetMinor: row.maxCampaignBudgetMinor,
  budgetCurrency: row.budgetCurrency,
  maxScalePercent: row.maxScalePercent,
  advantageCreativeEnabled: row.advantageCreativeEnabled === 1,
  timezone: row.timezone,
  defaultCountries: JSON.parse(row.defaultCountries),
  nameTemplates: {
    campaign: row.campaignNameTemplate,
    adset: row.adsetNameTemplate,
    ad: row.adNameTemplate,
  },
  launchDefaults: JSON.parse(row.launchDefaults),
});

const toColumns = (patch: SettingsPatch) => ({
  maxCampaignBudgetMinor: patch.maxCampaignBudgetMinor,
  budgetCurrency: patch.budgetCurrency,
  maxScalePercent: patch.maxScalePercent,
  advantageCreativeEnabled:
    patch.advantageCreativeEnabled === undefined
      ? undefined
      : Number(patch.advantageCreativeEnabled),
  timezone: patch.timezone,
  defaultCountries:
    patch.defaultCountries && JSON.stringify(patch.defaultCountries),
  campaignNameTemplate: patch.nameTemplates?.campaign,
  adsetNameTemplate: patch.nameTemplates?.adset,
  adNameTemplate: patch.nameTemplates?.ad,
  launchDefaults: patch.launchDefaults && JSON.stringify(patch.launchDefaults),
});

export const selectSettings = (orm: DrizzleD1Database, scope: Scope) =>
  orm
    .select(settingsColumns)
    .from(workspaceSettings)
    .where(inWorkspace(workspaceSettings, scope))
    .limit(1);

export const insertDefaultSettings = (
  db: D1Database,
  workspaceId: string,
  at: number,
) =>
  drizzle(db).insert(workspaceSettings).values({ workspaceId, updatedAt: at });

export async function findSettings(
  db: D1Database,
  scope: Scope,
): Promise<Settings | null> {
  const [row] = await selectSettings(drizzle(db), scope);
  return row ? toSettings(row) : null;
}

export async function updateSettings(
  db: D1Database,
  scope: Scope,
  patch: SettingsPatch,
  audit: AuditEntry,
  at: number,
): Promise<Settings | null> {
  const orm = drizzle(db);
  const [[row]] = await orm.batch([
    orm
      .update(workspaceSettings)
      .set({ ...toColumns(patch), updatedBy: scope.userId, updatedAt: at })
      .where(inWorkspace(workspaceSettings, scope))
      .returning(settingsColumns),
    auditStatement(db, audit),
  ]);
  return row ? toSettings(row) : null;
}
