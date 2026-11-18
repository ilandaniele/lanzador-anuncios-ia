import { useLocation, useNavigate, useParams } from "react-router";
import { useMe } from "../features/auth/use-me";
import { t } from "../i18n/es-AR";
import { workspacePath } from "./nav-items";

const DEFAULT_SECTION = "hoy";

export function WorkspaceSwitcher() {
  const { workspaceId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const workspaces = useMe().data?.workspaces ?? [];
  const current = workspaces.find(({ id }) => id === workspaceId);
  const section = pathname.split("/")[3] || DEFAULT_SECTION;

  return (
    <div className="flex flex-col">
      <label className="sr-only" htmlFor="workspace-switcher">
        {t("layout.workspace")}
      </label>
      <select
        id="workspace-switcher"
        className="border-rule bg-surface rounded-sm border px-2 py-1 font-semibold"
        value={workspaceId}
        onChange={(event) =>
          void navigate(workspacePath(event.target.value, section))
        }
      >
        {workspaces.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      {current && (
        <span className="text-ink-muted text-sm">
          {t(`roles.${current.role}`)}
        </span>
      )}
    </div>
  );
}
