import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cx, focusRing } from "../../components/classes";
import { t, type TextKey } from "../../i18n/es-AR";

export type CreativeTabId = "upload" | "copy" | "drive";

const TABS: { id: CreativeTabId; label: TextKey; keepMounted: boolean }[] = [
  { id: "upload", label: "launcher.step4.tabUpload", keepMounted: true },
  { id: "copy", label: "launcher.step4.tabCopy", keepMounted: false },
  { id: "drive", label: "launcher.step4.tabDrive", keepMounted: false },
];

const KEY_STEPS: Partial<Record<string, (index: number) => number>> = {
  ArrowRight: (index) => (index + 1) % TABS.length,
  ArrowLeft: (index) => (index + TABS.length - 1) % TABS.length,
  Home: () => 0,
  End: () => TABS.length - 1,
};

export function CreativeTabs({
  panels,
}: {
  panels: Record<CreativeTabId, ReactNode>;
}) {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: KeyboardEvent, index: number) {
    const target = KEY_STEPS[event.key]?.(index);
    if (target === undefined) return;
    event.preventDefault();
    setActive(target);
    tabs.current[target]?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label={t("launcher.step4.tabsLabel")}
        className="flex flex-wrap gap-1 border-b border-rule"
      >
        {TABS.map(({ id, label }, index) => (
          <button
            key={id}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${id}`}
            aria-selected={index === active}
            aria-controls={`${baseId}-panel-${id}`}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cx(
              "min-h-10 border-b-2 px-4 font-medium pointer-coarse:min-h-11",
              index === active
                ? "border-primary text-primary"
                : "border-transparent text-ink-muted hover:text-ink",
              focusRing,
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {TABS.map(({ id, keepMounted }, index) => (
        <div
          key={id}
          role="tabpanel"
          id={`${baseId}-panel-${id}`}
          aria-labelledby={`${baseId}-tab-${id}`}
          hidden={index !== active}
        >
          {(keepMounted || index === active) && panels[id]}
        </div>
      ))}
    </div>
  );
}
