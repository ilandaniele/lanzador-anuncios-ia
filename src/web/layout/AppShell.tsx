import type { MouseEvent } from "react";
import { Outlet } from "react-router";
import { t } from "../i18n/es-AR";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { THEME_CHOICES, useTheme } from "./use-theme";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const CONTENT_ID = "contenido";

function SkipLink() {
  const skip = (event: MouseEvent) => {
    event.preventDefault();
    document.getElementById(CONTENT_ID)?.focus();
  };

  return (
    <a
      href={`#${CONTENT_ID}`}
      onClick={skip}
      className="bg-surface text-ink sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:p-2"
    >
      {t("layout.skipToContent")}
    </a>
  );
}

function ThemeSelect() {
  const [choice, setChoice] = useTheme();

  return (
    <div>
      <label className="sr-only" htmlFor="theme-select">
        {t("layout.theme")}
      </label>
      <select
        id="theme-select"
        className="border-rule bg-surface rounded-sm border px-2 py-1"
        value={choice}
        onChange={(event) => {
          const next = THEME_CHOICES.find(
            (value) => value === event.target.value,
          );
          if (next) setChoice(next);
        }}
      >
        {THEME_CHOICES.map((value) => (
          <option key={value} value={value}>
            {t(`theme.${value}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function AppShell() {
  return (
    <div className="bg-paper text-ink min-h-screen md:pl-[232px]">
      <SkipLink />
      <Sidebar />
      <header className="border-rule flex h-14 items-center justify-between border-b px-4">
        <WorkspaceSwitcher />
        <ThemeSelect />
      </header>
      <div
        id={CONTENT_ID}
        tabIndex={-1}
        className="pb-[calc(64px+env(safe-area-inset-bottom))] outline-none md:pb-0"
      >
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
