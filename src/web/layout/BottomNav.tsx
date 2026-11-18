import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router";
import { t } from "../i18n/es-AR";
import { bottomItems, moreItems, workspacePath } from "./nav-items";
import type { NavItem } from "./nav-items";

function NavItems({
  items,
  workspaceId,
  onNavigate,
  className,
}: {
  items: NavItem[];
  workspaceId: string;
  onNavigate: () => void;
  className: (isActive: boolean) => string;
}) {
  return items.map(({ section, label }) => (
    <li key={section}>
      <NavLink
        to={workspacePath(workspaceId, section)}
        onClick={onNavigate}
        className={({ isActive }) => className(isActive)}
      >
        {t(label)}
      </NavLink>
    </li>
  ));
}

export function BottomNav() {
  const { workspaceId = "" } = useParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const close = () => setMoreOpen(false);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [moreOpen]);

  return (
    <div className="fixed inset-x-0 bottom-0 md:hidden">
      {moreOpen && (
        <nav
          id="more-sections"
          aria-label={t("nav.moreLabel")}
          className="border-rule bg-surface border-t"
        >
          <ul>
            <NavItems
              items={moreItems}
              workspaceId={workspaceId}
              onNavigate={close}
              className={(isActive) =>
                `flex h-12 items-center px-4 ${isActive ? "font-semibold" : ""}`
              }
            />
          </ul>
        </nav>
      )}
      <nav
        aria-label={t("nav.mobileLabel")}
        className="border-rule bg-paper border-t pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="flex h-16">
          <NavItems
            items={bottomItems}
            workspaceId={workspaceId}
            onNavigate={close}
            className={(isActive) =>
              `flex h-full flex-1 items-center justify-center px-2 ${
                isActive ? "text-primary font-semibold" : ""
              }`
            }
          />
          <li className="flex-1">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-sections"
              className="flex h-full w-full items-center justify-center px-2"
              onClick={() => setMoreOpen((open) => !open)}
            >
              {t("nav.more")}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
