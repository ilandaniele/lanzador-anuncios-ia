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

export function paginate<Row extends { id: string }>(
  rowsWithLookahead: Row[],
  limit: number,
  sortValueOf?: (row: Row) => string | number,
) {
  const rows = rowsWithLookahead.slice(0, limit);
  const last = rows.at(-1);
  const hasMore = rowsWithLookahead.length > limit && last !== undefined;
  return {
    rows,
    nextCursor: hasMore
      ? encodeCursor({ id: last.id, sortValue: sortValueOf?.(last) })
      : null,
  };
}

const invalidCursor = () =>
  new AppError(400, "VALIDATION", { fields: { cursor: "invalid" } });

export function decodeCursor(cursor: string): CursorPosition {
  try {
    const json = new TextDecoder().decode(base64urlDecode(cursor));
    return cursorPositionSchema.parse(JSON.parse(json));
  } catch {
    throw invalidCursor();
  }
}

export function decodeNumericCursor(cursor: string) {
  const { id, sortValue } = decodeCursor(cursor);
  if (typeof sortValue !== "number") throw invalidCursor();
  return { id, sortValue };
}

export function decodeStringCursor(cursor: string) {
  const { id, sortValue } = decodeCursor(cursor);
  if (typeof sortValue !== "string") throw invalidCursor();
  return { id, sortValue };
}
