import type {
  AdminErrorDto,
  AdminErrorsQuery,
} from "../../shared/schemas/admin";
import { decodeNumericCursor, paginate } from "../lib/cursor";
import {
  type ErrorEventRow,
  selectErrorEvents,
} from "../repositories/error-events";

const toAdminErrorDto = (row: ErrorEventRow): AdminErrorDto => ({
  ...row,
  createdAt: new Date(row.createdAt).toISOString(),
});

export async function listAdminErrors(
  db: D1Database,
  { source, cursor, limit }: AdminErrorsQuery,
) {
  const page = paginate(
    await selectErrorEvents(db, {
      source,
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.createdAt,
  );
  return {
    data: page.rows.map(toAdminErrorDto),
    nextCursor: page.nextCursor,
  };
}
