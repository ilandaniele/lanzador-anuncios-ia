import type { ReactNode } from "react";
import { cx } from "./classes";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "h-4 animate-pulse rounded-xs bg-surface-sunken motion-reduce:animate-none",
        className,
      )}
    />
  );
}

type SkeletonRegionProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function SkeletonRegion({
  label,
  children,
  className,
}: SkeletonRegionProps) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
