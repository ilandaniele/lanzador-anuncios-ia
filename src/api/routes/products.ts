import { Hono } from "hono";
import {
  archiveProductRequestSchema,
  createProductRequestSchema,
  listProductsQuerySchema,
  productPatchSchema,
} from "../../shared/schemas/products";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import {
  archiveProduct,
  createProduct,
  duplicateProduct,
  getProduct,
  listProducts,
  patchProduct,
} from "../services/products";
import type { AppEnv } from "../types";

export const productRoutes = new Hono<AppEnv>()
  .get("/w/:wid/products", ...member("viewer"), async (c) =>
    c.json(
      await listProducts(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, listProductsQuerySchema),
      ),
    ),
  )
  .post("/w/:wid/products", ...member("editor"), async (c) =>
    c.json(
      await createProduct(
        c.env.DB,
        c.get("scope")!,
        await parseJson(c, createProductRequestSchema),
      ),
      201,
    ),
  )
  .get("/w/:wid/products/:id", ...member("viewer"), async (c) =>
    c.json(await getProduct(c.env.DB, c.get("scope")!, c.req.param("id"))),
  )
  .patch("/w/:wid/products/:id", ...member("editor"), async (c) =>
    c.json(
      await patchProduct(
        c.env.DB,
        c.get("scope")!,
        c.req.param("id"),
        await parseJson(c, productPatchSchema),
      ),
    ),
  )
  .post("/w/:wid/products/:id/duplicate", ...member("editor"), async (c) =>
    c.json(
      await duplicateProduct(c.env.DB, c.get("scope")!, c.req.param("id")),
      201,
    ),
  )
  .post("/w/:wid/products/:id/archive", ...member("editor"), async (c) => {
    const { archived } = await parseJson(c, archiveProductRequestSchema);
    return c.json(
      await archiveProduct(
        c.env.DB,
        c.get("scope")!,
        c.req.param("id"),
        archived,
      ),
    );
  });
