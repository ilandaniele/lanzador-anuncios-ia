import { NavLink } from "react-router";
import type { Role } from "../../../shared/constants";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { canSeeSection, settingsSections } from "./sections";

type SettingsNavProps = { workspaceId: string; role: Role | undefined };

export function SettingsNav({ workspaceId, role }: SettingsNavProps) {
  return (
    <nav aria-label={t("settings.navLabel")} className="lg:w-48 lg:shrink-0">
      <ul className="flex flex-wrap gap-1 lg:flex-col">
        {settingsSections
          .filter((section) => canSeeSection(role, section))
          .map(({ section, label }) => (
            <li key={section}>
              <NavLink
                to={workspacePath(workspaceId, `ajustes/${section}`)}
                className={({ isActive }) =>
                  `flex min-h-10 items-center rounded-sm px-3 ${
                    isActive
                      ? "bg-primary-soft font-semibold"
                      : "text-ink-muted"
                  }`
                }
              >
                {t(label)}
              </NavLink>
            </li>
          ))}
      </ul>
    </nav>
  );
}
