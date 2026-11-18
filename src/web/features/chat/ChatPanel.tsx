import { useEffect, useRef, type RefObject } from "react";
import { useNavigate } from "react-router";
import { Button, IconButton } from "../../components/Button";
import { cx } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { useMediaQuery } from "../../lib/use-media-query";
import { workspacePath } from "../../layout/nav-items";
import { aiUsageReason, budgetExhaustedReason } from "../ai/budget-reason";
import { useWorkspaceOverview } from "../settings/use-workspace-settings";
import { chatErrorMessage, isSessionClosed } from "./chat-error";
import { ChatComposer } from "./ChatComposer";
import { ChatMessages } from "./ChatMessages";
import { useChatConversation } from "./use-chat-conversation";

export const DOCKED_QUERY = "(min-width: 1280px)";

type ChatPanelProps = {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
};

function useFocusWhileOpen(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const trigger = document.activeElement;
    (
      panel.querySelector<HTMLElement>("[data-autofocus]:not([disabled])") ??
      panel
    ).focus();
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open, panelRef]);
}

function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);
}

export function ChatPanel({ workspaceId, open, onClose }: ChatPanelProps) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLElement>(null);
  const docked = useMediaQuery(DOCKED_QUERY);
  const usage = useWorkspaceOverview(workspaceId).data?.aiUsage;
  const { lines, send, reset } = useChatConversation(workspaceId);
  useFocusWhileOpen(open, panelRef);
  useEscapeToClose(open, onClose);

  const budgetReason =
    aiUsageReason(usage) ?? budgetExhaustedReason(send.error);
  const closed = isSessionClosed(send.error);
  const composerReason =
    budgetReason ?? (closed ? t("chat.sessionClosed") : undefined);
  const failure = send.isError && !budgetReason && chatErrorMessage(send.error);

  function openDraft(launchId: string) {
    navigate(workspacePath(workspaceId, `lanzador/${launchId}?paso=6`));
    if (!docked) onClose();
  }

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          onClick={onClose}
          className="bg-ink/20 fixed inset-0 z-30 hidden md:block xl:hidden"
        />
      )}
      <aside
        ref={panelRef}
        hidden={!open}
        tabIndex={-1}
        aria-label={t("chat.panelLabel")}
        className={cx(
          "bg-surface text-ink fixed inset-0 z-40 flex flex-col outline-none",
          "md:left-auto md:w-[400px] md:border-l md:border-rule md:shadow-[0_16px_48px_rgb(21_32_43/0.2)]",
        )}
      >
        <header className="border-rule flex flex-col gap-1 border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("chat.open")}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" disabled={send.isPending} onClick={reset}>
                {t("chat.newConversation")}
              </Button>
              <IconButton aria-label={t("chat.close")} onClick={onClose}>
                <span aria-hidden="true">×</span>
              </IconButton>
            </div>
          </div>
          <p className="text-ink-muted text-sm">{t("chat.limits")}</p>
        </header>
        <ChatMessages
          workspaceId={workspaceId}
          lines={lines}
          pending={send.isPending}
          onOpenDraft={openDraft}
        />
        {(budgetReason || failure) && (
          <p
            role="alert"
            className={cx(
              "px-4 py-2",
              budgetReason ? "bg-warn-soft" : "bg-loss-soft",
            )}
          >
            {budgetReason || failure}
          </p>
        )}
        <ChatComposer
          pending={send.isPending}
          disabledReason={composerReason}
          onSend={send.mutate}
        />
      </aside>
    </>
  );
}
