import { Hono } from "hono";
import {
  chunkQuerySchema,
  createUploadRequestSchema,
} from "../../shared/schemas/uploads";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { rateLimit } from "../middleware/rate-limit";
import {
  abortUpload,
  completeUpload,
  createUpload,
  uploadChunk,
} from "../services/uploads";
import type { AppEnv } from "../types";

const uploadRateLimit = rateLimit("RL_UPL", (c) => c.get("user")!.id);

export const uploadRoutes = new Hono<AppEnv>()
  .post("/w/:wid/uploads", ...member("editor"), uploadRateLimit, async (c) =>
    c.json(
      await createUpload(
        c.env,
        c.get("scope")!,
        await parseJson(c, createUploadRequestSchema),
      ),
      201,
    ),
  )
  .put(
    "/w/:wid/uploads/:uploadId/chunk",
    ...member("editor"),
    uploadRateLimit,
    async (c) =>
      c.json(
        await uploadChunk(
          c.env,
          c.get("scope")!,
          c.req.param("uploadId"),
          parseQuery(c, chunkQuerySchema).start,
          {
            contentType: c.req.header("Content-Type"),
            contentLength: c.req.header("Content-Length"),
            body: c.req.raw.body,
          },
        ),
      ),
  )
  .post("/w/:wid/uploads/:uploadId/complete", ...member("editor"), async (c) =>
    c.json(
      await completeUpload(c.env, c.get("scope")!, c.req.param("uploadId")),
    ),
  )
  .post("/w/:wid/uploads/:uploadId/abort", ...member("editor"), async (c) => {
    await abortUpload(c.env.DB, c.get("scope")!, c.req.param("uploadId"));
    return c.body(null, 204);
  });
