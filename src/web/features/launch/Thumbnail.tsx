export function Thumbnail({ url }: { url: string | null }) {
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="size-14 shrink-0 rounded-xs bg-surface-sunken object-cover"
    />
  ) : (
    <div
      aria-hidden="true"
      className="size-14 shrink-0 rounded-xs bg-surface-sunken"
    />
  );
}
