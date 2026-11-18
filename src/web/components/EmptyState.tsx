import type { ReactNode } from "react";

type EmptyStateProps = {
  message: string;
  action?: ReactNode;
};

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <section className="mt-12 flex flex-col items-center gap-4 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 64 16"
        className="w-16 text-rule-strong"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M0 15h64" />
        <path d="M4 8h16M28 8h14" />
        <path d="M50 8h10" strokeDasharray="2 3" />
      </svg>
      <p className="max-w-prose text-ink">{message}</p>
      {action}
    </section>
  );
}
