import { z } from "zod";
import { base64urlDecode, base64urlEncode } from "./hash";
import { AppError } from "./errors";

const cursorPositionSchema = z.object({
  id: z.string().min(1),
  sortValue: z.union([z.string(), z.number()]).optional(),
});

export type CursorPosition = z.infer<typeof cursorPositionSchema>;

export function encodeCursor(position: CursorPosition): string {
  const json = JSON.stringify(position);
  return base64urlEncode(new TextEncoder().encode(json));
}

export function decodeCursor(cursor: string): CursorPosition {
  try {
    const json = new TextDecoder().decode(base64urlDecode(cursor));
    return cursorPositionSchema.parse(JSON.parse(json));
  } catch {
    throw new AppError(400, "VALIDATION", {
      fields: { cursor: "invalid" },
    });
  }
}
