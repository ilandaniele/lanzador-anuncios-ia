import { z } from "zod";

const MESSAGE_INPUT_MAX = 2000;
const STACK_MAX = 8000;
const ROUTE_MAX = 300;

export const clientErrorRequestSchema = z.object({
  message: z.string().min(1).max(MESSAGE_INPUT_MAX),
  stack: z.string().max(STACK_MAX).optional(),
  route: z.string().min(1).max(ROUTE_MAX),
});
export type ClientErrorRequest = z.infer<typeof clientErrorRequestSchema>;
