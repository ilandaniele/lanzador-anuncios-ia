import type { ListPilotProposalsQuery } from "../../../shared/schemas/pilot";
import type { PaginationQuery } from "../../../shared/schemas/common";
import { decodeNumericCursor, paginate } from "../../lib/cursor";
import {
  selectPilotProposals,
  selectPilotRuns,
} from "../../repositories/pilot";
import type { Scope } from "../../repositories/scope";
import { toPilotProposalDto, toPilotRunDto } from "./dto";

export async function listPilotRuns(
  db: D1Database,
  scope: Scope,
  { cursor, limit }: PaginationQuery,
) {
  const page = paginate(
    await selectPilotRuns(db, scope, {
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.startedAt,
  );
  return { data: page.rows.map(toPilotRunDto), nextCursor: page.nextCursor };
}

export async function listPilotProposals(
  db: D1Database,
  scope: Scope,
  { status, cursor, limit }: ListPilotProposalsQuery,
) {
  const page = paginate(
    await selectPilotProposals(db, scope, {
      status,
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.createdAt,
  );
  return {
    data: page.rows.map(toPilotProposalDto),
    nextCursor: page.nextCursor,
  };
}
