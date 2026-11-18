import { useEffect, useRef } from "react";
import { cx } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { DraftCard } from "./DraftCard";
import type { ChatLine } from "./use-chat-conversation";

type ChatMessagesProps = {
  workspaceId: string;
  lines: ChatLine[];
  pending: boolean;
  onOpenDraft: (launchId: string) => void;
};

function Thinking() {
  return (
    <p className="text-ink-muted" role="status">
      <span aria-hidden="true">● ● ●</span>
      <span className="sr-only">{t("chat.thinking")}</span>
    </p>
  );
}

export function ChatMessages({
  workspaceId,
  lines,
  pending,
  onOpenDraft,
}: ChatMessagesProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lines, pending]);

  return (
    <div
      ref={listRef}
      role="log"
      aria-live="polite"
      aria-label={t("chat.messages")}
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
    >
      {lines.length === 0 && !pending && (
        <p className="text-ink-muted">{t("chat.empty")}</p>
      )}
      {lines.map(({ id, role, content, draftLaunchId }) => (
        <div key={id} className="flex flex-col gap-3">
          <p
            className={cx(
              "whitespace-pre-wrap",
              role === "user"
                ? "bg-primary-soft self-end rounded-md px-3 py-2"
                : "border-pencil border-l-2 border-dashed pl-3",
            )}
          >
            {content}
          </p>
          {draftLaunchId && (
            <DraftCard
              workspaceId={workspaceId}
              launchId={draftLaunchId}
              onOpen={onOpenDraft}
            />
          )}
        </div>
      ))}
      {pending && <Thinking />}
    </div>
  );
}
