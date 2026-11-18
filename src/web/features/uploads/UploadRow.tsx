import { Button, Spinner } from "../../components/Button";
import { StatusChip } from "../../components/Chip";
import { t, type TextKey } from "../../i18n/es-AR";
import { formatMegabytes, truncateMiddle } from "./format-file";
import { ProgressBar } from "./ProgressBar";
import { rowStatus, type RowStatus, type UploadItem } from "./upload-item";

type UploadRowProps = {
  item: UploadItem;
  onCancel: (key: string) => void;
  onRetry: (item: UploadItem) => void;
};

const WORKING_TEXT: Partial<Record<RowStatus, TextKey>> = {
  queued: "uploads.queued",
  sheet: "uploads.sheet",
  tagging: "uploads.tagging",
  processing: "uploads.processing",
};

const CANCELABLE: RowStatus[] = ["queued", "uploading"];

function Uploading({ item }: { item: UploadItem }) {
  const { file, uploadedBytes, retry } = item;
  const percent = Math.floor((uploadedBytes / file.size) * 100);
  return (
    <>
      <ProgressBar label={file.name} percent={percent} />
      <p className="text-2xs text-ink-muted">
        {percent}% · {formatMegabytes(uploadedBytes)} {t("uploads.of")}{" "}
        {formatMegabytes(file.size)}
      </p>
      {retry && (
        <p className="text-2xs text-warn">
          {t("uploads.retrying")} {retry.chunk} {t("uploads.of")} {retry.total}
        </p>
      )}
    </>
  );
}

function Failed({ item, onRetry }: Pick<UploadRowProps, "item" | "onRetry">) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2">
      <StatusChip tone="error">
        {item.error ?? t("uploads.errorMeta")}
      </StatusChip>
      {item.phase === "failed" && (
        <Button variant="ghost" onClick={() => onRetry(item)}>
          {t("uploads.retry")}
        </Button>
      )}
    </div>
  );
}

export function UploadRow({ item, onCancel, onRetry }: UploadRowProps) {
  const status = rowStatus(item);
  const workingText = WORKING_TEXT[status];
  return (
    <li className="flex flex-col gap-1 border-b border-rule py-2">
      <div className="flex items-center justify-between gap-2">
        <span title={item.file.name} className="font-medium">
          {truncateMiddle(item.file.name)}
        </span>
        <span className="text-ink-muted">
          {formatMegabytes(item.file.size)}
        </span>
        {CANCELABLE.includes(status) && (
          <Button
            variant="ghost"
            aria-label={`${t("common.cancel")} ${item.file.name}`}
            onClick={() => onCancel(item.key)}
          >
            {t("common.cancel")}
          </Button>
        )}
      </div>
      {status === "uploading" && <Uploading item={item} />}
      {workingText && (
        <p className="flex items-center gap-2 text-ink-muted">
          {status !== "queued" && <Spinner />}
          {t(workingText)}
        </p>
      )}
      {status === "ready" && (
        <StatusChip tone="ready">{t("uploads.ready")}</StatusChip>
      )}
      {status === "error" && <Failed item={item} onRetry={onRetry} />}
      {item.duplicate && (
        <p className="text-2xs text-warn">{t("uploads.duplicate")}</p>
      )}
    </li>
  );
}
