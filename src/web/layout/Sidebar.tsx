import { NavLink, useParams } from "react-router";
import { useMe } from "../features/auth/use-me";
import { t } from "../i18n/es-AR";
import { sidebarItems, workspacePath } from "./nav-items";

export function Sidebar() {
  const { workspaceId = "" } = useParams();
  const email = useMe().data?.user.email;

  return (
    <aside className="border-rule bg-paper fixed inset-y-0 left-0 hidden w-[232px] flex-col justify-between border-r md:flex">
      <nav aria-label={t("nav.primaryLabel")}>
        <ul className="flex flex-col py-4">
          {sidebarItems.map(({ section, label }) => (
            <li key={section}>
              <NavLink
                to={workspacePath(workspaceId, section)}
                className={({ isActive }) =>
                  `flex h-10 items-center border-l-[3px] px-4 ${
                    isActive
                      ? "border-primary font-semibold"
                      : "border-transparent"
                  }`
                }
              >
                {t(label)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <p className="text-ink-muted truncate px-4 py-4 text-sm">{email}</p>
    </aside>
  );
}
