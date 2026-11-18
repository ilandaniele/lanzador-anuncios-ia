import { bodyLimit } from "hono/body-limit";
import { AppError } from "../lib/errors";

export const payloadLimit = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: () => {
      throw new AppError(413, "PAYLOAD_TOO_LARGE");
    },
  });
