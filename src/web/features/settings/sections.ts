import { ROLE_RANK, type Role } from "../../../shared/constants";
import type { TextKey } from "../../i18n/es-AR";

export type SettingsSection = {
  section: string;
  label: TextKey;
  minRole: Role;
};

export const settingsSections: SettingsSection[] = [
  { section: "general", label: "settings.general", minRole: "admin" },
  { section: "conexiones", label: "settings.connections", minRole: "editor" },
  { section: "miembros", label: "settings.members", minRole: "admin" },
  { section: "cuenta", label: "settings.account", minRole: "viewer" },
  { section: "peligro", label: "settings.danger", minRole: "owner" },
];

export const canSeeSection = (
  role: Role | undefined,
  { minRole }: SettingsSection,
) => role !== undefined && ROLE_RANK[role] >= ROLE_RANK[minRole];
