import type { AuditEntryDto } from "../../../shared/schemas/audit";
import { t } from "../../i18n/es-AR";

const KNOWN_ACTIONS = [
  "meta.campaign.create",
  "meta.adset.create",
  "meta.ad.create",
  "meta.status.update",
  "meta.budget.scale",
  "meta.launch.activate",
  "meta.connection.connect",
  "meta.connection.disconnect",
  "meta.deauthorized",
  "pilot.proposal.approve",
  "pilot.proposal.dismiss",
  "pilot.rules.update",
  "member.invite",
  "member.role.update",
  "member.remove",
  "workspace.delete",
  "workspace.disable",
  "settings.update",
  "campaign.protect",
  "campaign.unprotect",
  "billing.subscription.create",
  "billing.subscription.update",
  "billing.subscription.cancel",
] as const;

const KNOWN_FIELDS = ["status", "dailyBudgetMinor", "protected"] as const;

const isKnown = <Known extends string>(
  known: readonly Known[],
  value: string,
): value is Known => (known as readonly string[]).includes(value);

export const actionLabel = (action: string) =>
  isKnown(KNOWN_ACTIONS, action) ? t(`history.audit.action.${action}`) : action;

const fieldLabel = (field: string) =>
  isKnown(KNOWN_FIELDS, field) ? t(`history.audit.field.${field}`) : field;

function valueLabel(value: unknown): string {
  if (value === undefined || value === null)
    return t("history.audit.emptyValue");
  if (typeof value === "boolean")
    return t(value ? "history.audit.yes" : "history.audit.no");
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

export type FieldChange = { field: string; before: string; after: string };

export function detailChanges({ detail }: AuditEntryDto): FieldChange[] {
  const before = asRecord(detail?.before);
  const after = asRecord(detail?.after);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields.map((field) => ({
    field: fieldLabel(field),
    before: valueLabel(before[field]),
    after: valueLabel(after[field]),
  }));
}

export const proposalIdOf = ({ origin, detail }: AuditEntryDto) =>
  origin === "pilot" && typeof detail?.proposalId === "string"
    ? detail.proposalId
    : undefined;
