import { MAX_SCALE_PERCENT } from "../../shared/constants";
import type { SettingsPatch } from "../../shared/schemas/workspaces";
import { notFound, unprocessable } from "../lib/errors";
import { now } from "../lib/time";
import type { Scope } from "../repositories/scope";
import { findSettings, updateSettings } from "../repositories/settings";
import { manualAuditEntry } from "./audit-entry";

export async function getSettings(db: D1Database, scope: Scope) {
  const settings = await findSettings(db, scope);
  if (!settings) throw notFound();
  return settings;
}

export async function patchSettings(
  db: D1Database,
  scope: Scope,
  patch: SettingsPatch,
  requestId: string,
) {
  if (patch.maxScalePercent && patch.maxScalePercent > MAX_SCALE_PERCENT) {
    throw unprocessable("SCALE_PERCENT_MAX_50");
  }
  const audit = manualAuditEntry(scope, requestId, {
    action: "settings.update",
    objectType: "workspace",
    detail: { changes: patch },
  });
  const settings = await updateSettings(db, scope, patch, audit, now());
  if (!settings) throw notFound();
  return { settings };
}
