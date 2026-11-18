import {
  DRIVE_IMPORT_MAX_IN_FLIGHT,
  type DriveImportRequest,
  type DriveImportResponse,
} from "../../../shared/schemas/google";
import type { Env } from "../../env";
import { AppError, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { now } from "../../lib/time";
import type { NewCreative } from "../../repositories/creatives";
import {
  countImportingCreatives,
  insertImportingCreatives,
  markImportsFailed,
} from "../../repositories/drive-imports";
import { findGoogleConnection } from "../../repositories/google-connections";
import { findEnabledAdAccount } from "../../repositories/meta-assets";
import type { Scope } from "../../repositories/scope";
import { enqueueJob } from "../jobs";
import { allowedFileKind } from "../uploads";

type ImportFile = DriveImportRequest["files"][number];

const ENQUEUE_FAILURE = "No pude iniciar la importación. Volvé a intentarlo.";

function importingCreative(
  file: ImportFile,
  adAccountAssetId: string,
  at: number,
): NewCreative {
  return {
    id: newId(),
    adAccountAssetId,
    kind: allowedFileKind(file.mimeType, file.sizeBytes),
    originalFilename: file.name,
    contentType: file.mimeType,
    sizeBytes: file.sizeBytes,
    source: "drive",
    status: "importing",
    createdAt: at,
    updatedAt: at,
  };
}

async function assertImportTargets(
  db: D1Database,
  scope: Scope,
  adAccountAssetId: string,
  fileCount: number,
) {
  const [account, connection, inFlight] = await Promise.all([
    findEnabledAdAccount(db, scope, adAccountAssetId),
    findGoogleConnection(db, scope),
    countImportingCreatives(db, scope),
  ]);
  if (!account) throw notFound();
  if (connection?.status !== "active") {
    throw conflict("GOOGLE_RECONNECT_REQUIRED");
  }
  if (inFlight + fileCount > DRIVE_IMPORT_MAX_IN_FLIGHT) {
    throw new AppError(429, "RATE_LIMITED");
  }
}

export async function startDriveImport(
  env: Pick<Env, "DB" | "JOB_WF">,
  scope: Scope,
  { adAccountAssetId, files }: DriveImportRequest,
): Promise<DriveImportResponse> {
  const at = now();
  const rows = files.map((file) =>
    importingCreative(file, adAccountAssetId, at),
  );
  await assertImportTargets(env.DB, scope, adAccountAssetId, files.length);
  await insertImportingCreatives(env.DB, scope, rows);
  const enqueued = await Promise.allSettled(
    rows.map(({ id }, index) =>
      enqueueJob(env, {
        kind: "drive_import_file",
        key: id,
        workspaceId: scope.workspaceId,
        payload: {
          creativeId: id,
          fileId: files[index]!.id,
          adAccountAssetId,
        },
      }),
    ),
  );
  const notEnqueued = rows
    .filter((_, index) => enqueued[index]!.status === "rejected")
    .map(({ id }) => id);
  await markImportsFailed(env.DB, scope, notEnqueued, ENQUEUE_FAILURE, now());
  return {
    data: rows.map(({ id }) => ({ creativeId: id, status: "importing" })),
  };
}
