import { useState, type KeyboardEvent } from "react";
import { CHAT_TEXT_MAX } from "../../../shared/schemas/chat";
import { Button } from "../../components/Button";
import { controlClass, cx } from "../../components/classes";
import { t } from "../../i18n/es-AR";

const MAX_ROWS = 6;

type ChatComposerProps = {
  pending: boolean;
  disabledReason?: string;
  onSend: (text: string) => void;
};

export function ChatComposer({
  pending,
  disabledReason,
  onSend,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const rows = Math.min(text.split("\n").length, MAX_ROWS);
  const trimmed = text.trim();
  const blocked = pending || Boolean(disabledReason);

  function submit() {
    if (blocked || !trimmed) return;
    onSend(trimmed);
    setText("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submit();
  }

  return (
    <form
      className="border-rule flex items-end gap-2 border-t p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        data-autofocus
        aria-label={t("chat.composerLabel")}
        rows={rows}
        maxLength={CHAT_TEXT_MAX}
        value={text}
        disabled={blocked}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        className={cx(controlClass, "resize-none")}
      />
      <Button
        type="submit"
        className="h-11"
        loading={pending}
        disabledReason={disabledReason}
      >
        {t("chat.send")}
      </Button>
    </form>
  );
}
