export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export const controlClass =
  "min-h-10 w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-ink " +
  "hover:border-ink-muted focus-visible:border-primary " +
  "aria-invalid:border-2 aria-invalid:border-loss " +
  "disabled:bg-surface-sunken disabled:text-ink-subtle " +
  "pointer-coarse:min-h-11 " +
  focusRing;
