import type { Cta } from "../../../shared/constants";
import type { CreativeDto } from "../../../shared/schemas/creatives";
import { t } from "../../i18n/es-AR";

export type AdPreviewCopy = {
  primaryText?: string;
  headline?: string;
  description?: string;
  cta?: Cta;
};

type AdPreviewCardProps = {
  adName: string;
  pageName?: string;
  copy?: AdPreviewCopy;
  creative?: CreativeDto;
  link?: string;
};

function Media({
  adName,
  creative,
  isClone,
}: Pick<AdPreviewCardProps, "adName" | "creative"> & { isClone: boolean }) {
  if (creative?.thumbnailUrl)
    return (
      <img
        src={creative.thumbnailUrl}
        alt={adName}
        loading="lazy"
        decoding="async"
        className="aspect-square w-full bg-surface-sunken object-cover"
      />
    );
  return (
    <div className="flex aspect-square w-full items-center justify-center bg-surface-sunken p-4 text-center text-ink-muted">
      {t(
        isClone
          ? "launcher.review.previewClone"
          : "launcher.review.previewNoMedia",
      )}
    </div>
  );
}

export function AdPreviewCard({
  adName,
  pageName,
  copy,
  creative,
  link,
}: AdPreviewCardProps) {
  return (
    <article
      aria-label={adName}
      className="flex w-full max-w-[320px] flex-col overflow-hidden rounded-sm border border-rule bg-surface"
    >
      <header className="p-3">
        <h4 className="font-medium">{adName}</h4>
        <p className="text-ink-subtle">
          {pageName && `${pageName} · `}
          {t("launcher.review.previewSponsored")}
        </p>
      </header>
      {copy?.primaryText && <p className="px-3 pb-3">{copy.primaryText}</p>}
      <Media adName={adName} creative={creative} isClone={!copy} />
      {copy && (
        <footer className="flex items-center justify-between gap-2 bg-surface-sunken p-3">
          <div className="min-w-0">
            {copy.headline && <p className="font-medium">{copy.headline}</p>}
            {copy.description && (
              <p className="text-ink-muted">{copy.description}</p>
            )}
            {link && (
              <p className="truncate text-ink-subtle">
                {`${t("launcher.review.previewLink")}: ${link}`}
              </p>
            )}
          </div>
          {copy.cta && (
            <span className="shrink-0 rounded-sm border border-rule-strong bg-surface px-3 py-1 font-medium">
              {t(`products.cta.${copy.cta}`)}
            </span>
          )}
        </footer>
      )}
    </article>
  );
}
