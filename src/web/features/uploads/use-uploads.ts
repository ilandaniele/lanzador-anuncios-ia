import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreativeDto } from "../../../shared/schemas/creatives";
import { buildContactSheet, type DecodedMedia } from "./contact-sheet";
import type { UploadEnvironment } from "./upload-environment";
import {
  isMetaInProgress,
  type UploadItem,
  withLatestCreatives,
} from "./upload-item";
import {
  sendContactSheet,
  uploadFile,
  uploadKind,
  validateFile,
} from "./upload-client";
import { rejectionMessage, uploadErrorMessage } from "./upload-messages";
import { useCreativeStatuses } from "./use-creative-statuses";

interface UseUploadsOptions {
  workspaceId: string;
  adAccountAssetId: string | null;
  environment: UploadEnvironment;
  onReady?: (creative: CreativeDto) => void;
}

const toMetadata = ({ width, height, durationMs }: DecodedMedia) => ({
  width,
  height,
  ...(durationMs ? { durationMs } : {}),
});

export function useUploads({
  workspaceId,
  adAccountAssetId,
  environment,
  onReady,
}: UseUploadsOptions) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const lastKey = useRef(0);
  const notified = useRef(new Set<string>());

  const patch = useCallback(
    (key: string, changes: Partial<UploadItem>) =>
      setItems((previous) =>
        previous.map((item) =>
          item.key === key ? { ...item, ...changes } : item,
        ),
      ),
    [],
  );

  async function tagCreative(
    item: UploadItem,
    creativeId: string,
    media: DecodedMedia,
  ) {
    patch(item.key, { phase: "sheet" });
    const sheet = await buildContactSheet(media, item.kind, environment.media);
    patch(item.key, { phase: "tagging" });
    await sendContactSheet(workspaceId, creativeId, sheet);
  }

  async function process(item: UploadItem, signal: AbortSignal) {
    if (signal.aborted || !adAccountAssetId) return;
    patch(item.key, {
      phase: "uploading",
      uploadedBytes: 0,
      retry: null,
      error: null,
    });
    const media = await environment.media
      .loadMedia(item.file, item.kind)
      .catch(() => null);
    try {
      const { creative, duplicateOf } = await uploadFile({
        workspaceId,
        adAccountAssetId,
        file: item.file,
        signal,
        metadata: media ? toMetadata(media) : undefined,
        retryDelayMs: environment.retryDelayMs,
        onProgress: (uploadedBytes) => patch(item.key, { uploadedBytes }),
        onRetry: (retry) => patch(item.key, { retry }),
      });
      patch(item.key, { creative, duplicate: Boolean(duplicateOf) });
      if (media) {
        await tagCreative(item, creative.id, media).catch(() => undefined);
      }
      patch(item.key, { phase: "submitted" });
    } catch (error) {
      if (!signal.aborted) {
        patch(item.key, { phase: "failed", error: uploadErrorMessage(error) });
      }
    } finally {
      media?.release();
    }
  }

  function enqueue(item: UploadItem) {
    const controller = new AbortController();
    controllers.current.set(item.key, controller);
    queue.current = queue.current.then(() => process(item, controller.signal));
  }

  function addFiles(files: File[]) {
    const accepted: UploadItem[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const reason = validateFile(file);
      if (reason) {
        rejected.push(rejectionMessage(file, reason));
        continue;
      }
      accepted.push({
        key: `upload-${(lastKey.current += 1)}`,
        file,
        kind: uploadKind(file)!,
        phase: "queued",
        uploadedBytes: 0,
        retry: null,
        creative: null,
        duplicate: false,
        error: null,
      });
    }
    setRejections(rejected);
    setItems((previous) => [...previous, ...accepted]);
    accepted.forEach(enqueue);
  }

  function cancel(key: string) {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    setItems((previous) => previous.filter((item) => item.key !== key));
  }

  function retry(item: UploadItem) {
    patch(item.key, { phase: "queued", error: null });
    enqueue(item);
  }

  const trackedIds = items
    .filter(isMetaInProgress)
    .map((item) => item.creative!.id);
  const statuses = useCreativeStatuses(
    workspaceId,
    trackedIds,
    environment.pollIntervalMs,
  );
  const latest = useMemo(
    () => withLatestCreatives(items, statuses.data),
    [items, statuses.data],
  );

  useEffect(() => {
    for (const item of latest) {
      const creative = item.creative;
      const done = item.phase === "submitted" && creative?.status === "ready";
      if (done && !notified.current.has(creative.id)) {
        notified.current.add(creative.id);
        onReady?.(creative);
      }
    }
  }, [latest, onReady]);

  return { items: latest, rejections, addFiles, cancel, retry };
}
