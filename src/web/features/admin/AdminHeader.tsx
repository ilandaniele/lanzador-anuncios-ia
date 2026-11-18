import { Link, NavLink } from "react-router";
import { cx, focusRing } from "../../components/classes";
import { t } from "../../i18n/es-AR";

const SECTIONS = [
  { to: "/admin", label: "admin.navWorkspaces", end: true },
  { to: "/admin/uso", label: "admin.navUsage", end: false },
  { to: "/admin/errores", label: "admin.navErrors", end: false },
] as const;

export function AdminHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-4 py-3">
      <p className="font-semibold">{t("admin.brand")}</p>
      <nav aria-label={t("admin.navLabel")} className="flex gap-4">
        {SECTIONS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(focusRing, isActive ? "font-semibold" : "text-primary")
            }
          >
            {t(label)}
          </NavLink>
        ))}
      </nav>
      <Link to="/" className="text-primary">
        {t("admin.backToWorkspaces")}
      </Link>
    </header>
  );
}
