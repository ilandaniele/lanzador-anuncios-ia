import { AUDIT_ORIGINS } from "../../../shared/constants";
import { Select } from "../../components/Select";
import { t } from "../../i18n/es-AR";
import { useMembers } from "../members/use-members";
import type { AuditFilters as Filters } from "./use-history";

type AuditFiltersProps = {
  workspaceId: string;
  filters: Filters;
  onChange: (filters: Filters) => void;
};

const originOptions = [
  { value: "", label: t("history.audit.allOrigins") },
  ...AUDIT_ORIGINS.map((origin) => ({
    value: origin,
    label: t(`history.audit.origin.${origin}`),
  })),
];

export function AuditFilters({
  workspaceId,
  filters,
  onChange,
}: AuditFiltersProps) {
  const members = useMembers(workspaceId);
  const userOptions = [
    { value: "", label: t("history.audit.allUsers") },
    ...(members.data ?? []).map(({ userId, email }) => ({
      value: userId,
      label: email,
    })),
  ];

  return (
    <div className="mb-4 flex flex-wrap gap-4">
      <Select
        label={t("history.audit.originLabel")}
        options={originOptions}
        value={filters.origin}
        onChange={(event) =>
          onChange({ ...filters, origin: event.target.value })
        }
      />
      <Select
        label={t("history.audit.userLabel")}
        options={userOptions}
        value={filters.actorUserId}
        onChange={(event) =>
          onChange({ ...filters, actorUserId: event.target.value })
        }
      />
    </div>
  );
}
