import { Hono } from "hono";
import {
  copyPatchSchema,
  createCopyRequestSchema,
  generateCopiesRequestSchema,
  listCopiesQuerySchema,
} from "../../shared/schemas/copies";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { expensiveRateLimit } from "../middleware/rate-limit";
import { generateCopies } from "../services/ai/copies";
import {
  createManualCopy,
  listCopies,
  patchCopy,
} from "../services/product-copies";
import type { AppEnv } from "../types";

export const copyRoutes = new Hono<AppEnv>()
  .post(
    "/w/:wid/products/:id/copies/generate",
    ...member("editor"),
    expensiveRateLimit,
    async (c) =>
      c.json(
        await generateCopies(
          c.env,
          c.get("scope")!,
          c.req.param("id"),
          await parseJson(c, generateCopiesRequestSchema),
        ),
      ),
  )
  .get("/w/:wid/products/:id/copies", ...member("viewer"), async (c) =>
    c.json(
      await listCopies(
        c.env.DB,
        c.get("scope")!,
        c.req.param("id"),
        parseQuery(c, listCopiesQuerySchema),
      ),
    ),
  )
  .post("/w/:wid/products/:id/copies", ...member("editor"), async (c) =>
    c.json(
      await createManualCopy(
        c.env.DB,
        c.get("scope")!,
        c.req.param("id"),
        await parseJson(c, createCopyRequestSchema),
      ),
      201,
    ),
  )
  .patch("/w/:wid/copies/:copyId", ...member("editor"), async (c) =>
    c.json(
      await patchCopy(
        c.env.DB,
        c.get("scope")!,
        c.req.param("copyId"),
        await parseJson(c, copyPatchSchema),
      ),
    ),
  );
