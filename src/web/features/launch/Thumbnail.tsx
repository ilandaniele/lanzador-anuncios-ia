import { cx } from "../../components/classes";

const BASE = "shrink-0 rounded-xs bg-surface-sunken";

type ThumbnailProps = { url: string | null; className?: string };

export function Thumbnail({ url, className = "size-14" }: ThumbnailProps) {
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className={cx(BASE, "object-cover", className)}
    />
  ) : (
    <div aria-hidden="true" className={cx(BASE, className)} />
  );
}
