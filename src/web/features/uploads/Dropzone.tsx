import { useId, useState, type DragEvent } from "react";
import { UPLOAD_CONTENT_TYPES } from "../../../shared/schemas/uploads";
import type { CreativeDto } from "../../../shared/schemas/creatives";
import { cx, focusRing } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import {
  browserEnvironment,
  type UploadEnvironment,
} from "./upload-environment";
import { UploadRow } from "./UploadRow";
import { useUploads } from "./use-uploads";

type DropzoneProps = {
  workspaceId: string;
  adAccountAssetId: string | null;
  environment?: UploadEnvironment;
  onReady?: (creative: CreativeDto) => void;
};

const ACCEPT = [...UPLOAD_CONTENT_TYPES.keys()].join(",");

export function Dropzone({
  workspaceId,
  adAccountAssetId,
  environment = browserEnvironment,
  onReady,
}: DropzoneProps) {
  const noticeId = useId();
  const [dragging, setDragging] = useState(false);
  const { items, rejections, addFiles, cancel, retry } = useUploads({
    workspaceId,
    adAccountAssetId,
    environment,
    onReady,
  });
  const disabled = adAccountAssetId === null;
  const uploaded = items.filter((item) => item.phase === "submitted").length;

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) addFiles(Array.from(event.dataTransfer.files));
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!disabled) setDragging(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cx(
          "flex min-h-40 flex-col items-center justify-center gap-2 rounded-sm p-4 text-center",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
          dragging
            ? "border-[1.5px] border-solid border-primary bg-primary-soft"
            : "border-[1.5px] border-dashed border-rule-strong bg-surface-sunken",
          rejections.length > 0 && "border-loss",
          disabled ? "cursor-not-allowed text-ink-subtle" : "cursor-pointer",
        )}
      >
        <input
          type="file"
          multiple
          accept={ACCEPT}
          disabled={disabled}
          aria-describedby={noticeId}
          className="sr-only"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <span className="font-medium">
          {disabled ? t("uploads.chooseAccount") : t("uploads.dropTitle")}
        </span>
        {!disabled && (
          <span
            className={cx(
              "rounded-sm border border-rule-strong bg-surface px-4 py-2 font-medium",
              focusRing,
            )}
          >
            {t("uploads.chooseFiles")}
          </span>
        )}
        <span id={noticeId} className="text-ink-muted">
          {t("uploads.keepTabOpen")}
        </span>
      </label>
      {rejections.map((message) => (
        <p key={message} role="alert" className="text-loss">
          {message}
        </p>
      ))}
      {items.length > 0 && (
        <>
          <p aria-live="polite" className="text-ink-muted">
            {uploaded} {t("uploads.of")} {items.length} {t("uploads.uploaded")}
          </p>
          <ul aria-label={t("uploads.listLabel")}>
            {items.map((item) => (
              <UploadRow
                key={item.key}
                item={item}
                onCancel={cancel}
                onRetry={retry}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
