import { useId, useRef, useState, type KeyboardEvent } from "react";
import { t } from "../i18n/es-AR";
import { Button } from "./Button";
import { controlClass } from "./classes";
import { Field } from "./Field";
import { Skeleton, SkeletonRegion } from "./Skeleton";

const LOADING_ROWS = 3;

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
};

type ComboboxProps = {
  label: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  loading?: boolean;
  loadError?: string;
  onRetry?: () => void;
  emptyText?: string;
};

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function Combobox({
  label,
  options,
  value,
  onChange,
  required,
  hint,
  error,
  loading,
  loadError,
  onRetry,
  emptyText = t("combobox.empty"),
}: ComboboxProps) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) =>
    normalize(option.label).includes(normalize(query)),
  );
  const active = Math.min(activeIndex, filtered.length - 1);
  const optionId = (index: number) => `${listboxId}-${index}`;

  function openList() {
    if (open) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function select(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList();
      else setActiveIndex(Math.min(active + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = filtered[active];
      if (option) select(option);
    } else if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <Field label={label} required={required} hint={hint} error={error}>
      {(control) => (
        <div
          ref={wrapperRef}
          className="relative"
          onBlur={(event) => {
            if (!wrapperRef.current?.contains(event.relatedTarget))
              setOpen(false);
          }}
        >
          <input
            {...control}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-required={required || undefined}
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && filtered[active] ? optionId(active) : undefined
            }
            value={open ? query : (selected?.label ?? "")}
            onChange={(event) => {
              openList();
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onClick={openList}
            onKeyDown={handleKeyDown}
            className={controlClass}
          />
          {open && (
            <div className="absolute z-30 mt-1 w-full rounded-sm border border-rule bg-surface-raised shadow-[0_4px_12px_rgb(21_32_43/0.12)]">
              {loading && (
                <SkeletonRegion label={t("combobox.loading")} className="p-2">
                  {Array.from({ length: LOADING_ROWS }, (_, index) => (
                    <Skeleton key={index} className="my-2 h-5" />
                  ))}
                </SkeletonRegion>
              )}
              {loadError && (
                <div role="alert" className="flex items-center gap-2 p-3">
                  <p className="flex-1 text-loss">{loadError}</p>
                  {onRetry && (
                    <Button variant="ghost" onClick={onRetry}>
                      {t("errors.retry")}
                    </Button>
                  )}
                </div>
              )}
              {!loading && !loadError && filtered.length === 0 && (
                <p className="p-3 text-ink-muted">{emptyText}</p>
              )}
              <ul id={listboxId} role="listbox" aria-label={label}>
                {!loading &&
                  !loadError &&
                  filtered.map((option, index) => (
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- keyboard handled on the combobox input
                    <li
                      key={option.value}
                      id={optionId(index)}
                      role="option"
                      aria-selected={option.value === value}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => select(option)}
                      className={
                        index === active
                          ? "cursor-pointer bg-primary-soft px-3 py-2"
                          : "cursor-pointer px-3 py-2"
                      }
                    >
                      {option.label}
                      {option.description && (
                        <span className="block text-ink-subtle">
                          {option.description}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Field>
  );
}
