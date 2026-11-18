import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { ChatReply } from "../../../shared/schemas/chat";
import { apiFetch } from "../../lib/api";

export type ChatLine = {
  id: string;
  role: "user" | "assistant";
  content: string;
  draftLaunchId?: string;
};

const chatApi = (workspaceId: string) => `/api/w/${workspaceId}/chat/sessions`;

function withDraft(reply: ChatReply): ChatLine[] {
  const lines: ChatLine[] = reply.messages.map(({ id, role, content }) => ({
    id,
    role,
    content,
  }));
  const last = lines[lines.length - 1];
  if (last && reply.draftLaunchId) last.draftLaunchId = reply.draftLaunchId;
  return lines;
}

export function useChatConversation(workspaceId: string) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const sessionId = useRef<string | null>(null);
  const localId = useRef(0);

  const send = useMutation({
    mutationFn: async (text: string) => {
      if (!sessionId.current)
        sessionId.current = (
          await apiFetch<{ session: { id: string } }>(chatApi(workspaceId), {
            method: "POST",
          })
        ).session.id;
      return apiFetch<ChatReply>(
        `${chatApi(workspaceId)}/${sessionId.current}/messages`,
        { method: "POST", body: { text } },
      );
    },
    onMutate: (text) => {
      localId.current += 1;
      setLines((current) => [
        ...current,
        { id: `local-${localId.current}`, role: "user", content: text },
      ]);
    },
    onSuccess: (reply) =>
      setLines((current) => [...current, ...withDraft(reply)]),
  });

  function reset() {
    sessionId.current = null;
    setLines([]);
    send.reset();
  }

  return { lines, send, reset };
}
