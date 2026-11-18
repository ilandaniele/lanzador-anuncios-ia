import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./classes";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DialogProps = {
  title: string;
  onClose: () => void;
  closable?: boolean;
  width?: "narrow" | "wide";
  children: ReactNode;
};

export function Dialog({
  title,
  onClose,
  closable = true,
  width = "narrow",
  children,
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = document.activeElement;
    const panel = panelRef.current;
    const initial =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    initial?.focus();
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && closable) {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closable, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => closable && onClose()}
        className="absolute inset-0 cursor-default bg-scrim"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "relative max-h-full w-full overflow-y-auto rounded-t-lg bg-surface-raised p-6 text-ink shadow-[0_16px_48px_rgb(21_32_43/0.2)] md:rounded-lg",
          width === "narrow" ? "md:max-w-120" : "md:max-w-160",
        )}
      >
        <h2 id={titleId} className="mb-4 text-xl font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
