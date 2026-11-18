import { z } from "zod";
import type { Graph } from "./client";
import { invalidPayloadError } from "./errors";

export type CreatedEdge = "campaigns" | "adsets" | "ads";

const SECOND_MS = 1000;

const createdListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      created_time: z.string(),
    }),
  ),
});

const parseMetaTime = (time: string) =>
  Date.parse(time.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));

export async function findCreatedByName(
  graph: Graph,
  adAccountId: string,
  edge: CreatedEdge,
  name: string,
  since: number,
): Promise<string | null> {
  const result = createdListSchema.safeParse(
    await graph.get<unknown>(`${adAccountId}/${edge}`, {
      fields: "id,name,created_time",
      filtering: JSON.stringify([
        { field: "name", operator: "EQUAL", value: name },
      ]),
    }),
  );
  if (!result.success) throw invalidPayloadError();
  const floor = Math.floor(since / SECOND_MS) * SECOND_MS;
  const found = result.data.data.find(
    (object) =>
      object.name === name && parseMetaTime(object.created_time) >= floor,
  );
  return found?.id ?? null;
}
