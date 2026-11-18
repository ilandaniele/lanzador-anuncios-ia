import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx, focusRing } from "./classes";

type TabsProps<Id extends string> = {
  label: string;
  tabs: ReadonlyArray<{ id: Id; label: string }>;
  selected: Id;
  onSelect: (id: Id) => void;
  children: ReactNode;
};

export function Tabs<Id extends string>({
  label,
  tabs,
  selected,
  onSelect,
  children,
}: TabsProps<Id>) {
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const tabId = (id: Id) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  function handleKeyDown(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    onSelect(tabs[next]!.id);
    buttons.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-4 border-b border-rule"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={tab.id === selected}
            aria-controls={panelId}
            tabIndex={tab.id === selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cx(
              "-mb-px min-h-10 border-b-2 px-1 font-medium pointer-coarse:min-h-11",
              tab.id === selected
                ? "border-primary text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
              focusRing,
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(selected)}>
        {children}
      </div>
    </div>
  );
}
