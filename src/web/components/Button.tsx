import { useId, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { cx, focusRing } from "./classes";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  loadingLabel?: string;
  disabledReason?: string;
};

const variantClass: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-hover active:translate-y-px aria-disabled:bg-surface-sunken aria-disabled:text-ink-subtle",
  secondary:
    "border border-rule-strong bg-surface text-ink hover:bg-paper active:bg-surface-sunken aria-disabled:border-rule aria-disabled:text-ink-subtle",
  ghost:
    "text-primary hover:bg-primary-soft aria-disabled:text-ink-subtle aria-disabled:hover:bg-transparent",
  danger:
    "bg-loss text-white hover:brightness-90 dark:text-paper aria-disabled:bg-surface-sunken aria-disabled:text-ink-subtle",
};

const baseClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-sm px-4 font-medium " +
  "pointer-coarse:min-h-11 aria-disabled:cursor-not-allowed " +
  focusRing;

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}

export function Button({
  variant = "primary",
  loading = false,
  loadingLabel,
  disabledReason,
  type = "button",
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const blocked = loading || Boolean(disabledReason);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (blocked) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <>
      <button
        {...rest}
        type={type}
        aria-disabled={blocked || undefined}
        aria-busy={loading || undefined}
        aria-describedby={disabledReason ? reasonId : rest["aria-describedby"]}
        title={disabledReason ?? rest.title}
        onClick={handleClick}
        className={cx(baseClass, variantClass[variant], className)}
      >
        {loading && <Spinner />}
        {loading && loadingLabel ? loadingLabel : children}
      </button>
      {disabledReason && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </>
  );
}

type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> & {
  "aria-label": string;
};

export function IconButton({
  type = "button",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx(
        "inline-flex size-9 items-center justify-center rounded-sm text-ink hover:bg-paper pointer-coarse:size-11",
        focusRing,
        className,
      )}
    />
  );
}
