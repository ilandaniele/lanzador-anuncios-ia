import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { cx } from "../../components/classes";
import { useMe } from "./use-me";

export function AuthColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-100 flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {children}
    </main>
  );
}

export function Strip({
  tone,
  children,
}: {
  tone: "warn" | "loss";
  children: ReactNode;
}) {
  return (
    <p
      role="alert"
      className={cx(
        "rounded-sm p-3 text-ink",
        tone === "warn" ? "bg-warn-soft" : "bg-loss-soft",
      )}
    >
      {children}
    </p>
  );
}

export function RedirectIfSession({ to }: { to: string }) {
  return useMe().data ? <Navigate replace to={to} /> : null;
}
