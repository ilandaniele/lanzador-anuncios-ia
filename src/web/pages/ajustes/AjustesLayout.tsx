import { Outlet, useMatch, useParams } from "react-router";
import {
  canSeeSection,
  settingsSections,
} from "../../features/settings/sections";
import { SettingsNav } from "../../features/settings/SettingsNav";
import { useWorkspaceRole } from "../../features/settings/use-workspace-role";
import { t } from "../../i18n/es-AR";

export default function AjustesLayout() {
  const { workspaceId = "" } = useParams();
  const role = useWorkspaceRole(workspaceId);
  const current = useMatch("/w/:workspaceId/ajustes/:section")?.params.section;
  const forbidden = settingsSections.some(
    (section) => section.section === current && !canSeeSection(role, section),
  );

  return (
    <main className="p-4">
      <h1 className="mb-4 text-2xl font-semibold">{t("nav.ajustes")}</h1>
      <div className="flex flex-col gap-6 lg:flex-row">
        <SettingsNav workspaceId={workspaceId} role={role} />
        <div className="min-w-0 max-w-[640px] flex-1">
          {forbidden ? (
            <p role="alert">{t("settings.forbidden")}</p>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </main>
  );
}
