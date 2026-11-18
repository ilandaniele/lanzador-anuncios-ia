import { useCallback, useEffect, useState } from "react";
import { useCanEdit } from "../products/use-can-edit";

export function useChatPanel(workspaceId: string) {
  const canChat = useCanEdit(workspaceId);
  const [open, setOpen] = useState(false);
  const openChat = useCallback(() => setOpen(true), []);
  const closeChat = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!canChat) return;
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canChat]);

  return { canChat, open: canChat && open, openChat, closeChat };
}
